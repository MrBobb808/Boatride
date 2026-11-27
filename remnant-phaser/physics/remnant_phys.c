// Remnant's physics core, compiled to WebAssembly (see README.md beside this file).
//
// Two tile grids live in this module's own memory, so the game's grid arrays are views into it and every write is
// seen at once: grid 0 is the classic world's (the shared foes, Echoes, props and bosses), grid 1 the Phaser
// World's (the hero and the Arcade-bodied bosses). Bodies are bottom-centre boxes (x = centre, y = feet), as in
// remnant/src/game/physics.ts, whose moveBody, bodyFits and line of sight this file reproduces operation for
// operation in doubles, so a body moves exactly as it did in JS. A body crosses every tile on its path (no
// tunnelling), one axis at a time: across, then up or down; one-way platforms hold only what falls onto them from
// above, unless it is dropping through.
//
// No libc and no allocator: fixed buffers, so the memory never grows and the views stay valid.

typedef unsigned char u8;

#define TILE 16.0
#define EPS 0.001
#define T_EMPTY 0
#define T_STONE 1
#define T_ONEWAY 4
#define MAX_CELLS (1 << 18)

static u8 grids[2][MAX_CELLS];
static int gw[2], gh[2];

// The body passed in and out: see the IO_* slots.
static double io[16];
enum { IO_X, IO_Y, IO_VX, IO_VY, IO_W, IO_H, IO_DROP, IO_GROUND, IO_WALL, IO_CEIL, IO_TILE };

__attribute__((export_name("grid"))) u8 *grid(int k) { return grids[k & 1]; }
__attribute__((export_name("io"))) double *io_ptr(void) { return io; }
__attribute__((export_name("max_cells"))) int max_cells(void) { return MAX_CELLS; }
__attribute__((export_name("set_dims"))) int set_dims(int k, int w, int h) {
  if (w <= 0 || h <= 0 || w > MAX_CELLS / h) return 0;
  gw[k & 1] = w; gh[k & 1] = h;
  return 1;
}

static inline int fl(double v) { return (int)__builtin_floor(v); }

// Grid.get: stone at the sides and below, open sky above. An open grid (the Phaser World's, where the map ends and
// the world's own bounds take over) is empty all round.
static inline int get(int k, int open, int x, int y) {
  if (x < 0 || x >= gw[k]) return open ? T_EMPTY : T_STONE;
  if (y < 0) return T_EMPTY;
  if (y >= gh[k]) return open ? T_EMPTY : T_STONE;
  return grids[k][y * gw[k] + x];
}

#define SOLID(t) ((mask >> (t)) & 1u)

// One move of a body through the grid by (dx, dy): moveBody's collision, given the displacement.
static void sweep(int k, unsigned mask, int open, double dx, double dy) {
  double x = io[IO_X], y = io[IO_Y], vx = io[IO_VX], vy = io[IO_VY], w = io[IO_W], h = io[IO_H], drop = io[IO_DROP];
  int wall = 0, ceil = 0, ground = 0, gtile = (int)io[IO_TILE];
  // ---- across
  if (dx != 0) {
    double nx = x + dx;
    int top = fl((y - h + EPS) / TILE), bot = fl((y - EPS) / TILE);
    if (dx > 0) {
      int first = fl((x + w / 2 - EPS) / TILE) + 1, last = fl((nx + w / 2 - EPS) / TILE);
      for (int col = first; col <= last && !wall; col++)
        for (int r = top; r <= bot; r++)
          if (SOLID(get(k, open, col, r))) { nx = col * TILE - w / 2; vx = 0; wall = 1; break; }
    } else {
      int first = fl((x - w / 2 + EPS) / TILE) - 1, last = fl((nx - w / 2 + EPS) / TILE);
      for (int col = first; col >= last && !wall; col--)
        for (int r = top; r <= bot; r++)
          if (SOLID(get(k, open, col, r))) { nx = (col + 1) * TILE + w / 2; vx = 0; wall = -1; break; }
    }
    x = nx;
  }
  // ---- up or down
  int l = fl((x - w / 2 + EPS) / TILE), r = fl((x + w / 2 - EPS) / TILE);
  if (dy > 0) {
    double ny = y + dy;
    int from = fl((y - EPS) / TILE), to = fl((ny - EPS) / TILE);
    for (int row = from + 1; row <= to && !ground; row++)
      for (int c = l; c <= r; c++) {
        int t = get(k, open, c, row);
        int oneway = t == T_ONEWAY && drop <= 0 && y <= row * TILE + EPS;
        if (SOLID(t) || oneway) { y = row * TILE; vy = 0; ground = 1; gtile = t; break; }
      }
    if (!ground) y = ny;
  } else if (dy < 0) {
    double ny = y + dy;
    int from = fl((y - h + EPS) / TILE), to = fl((ny - h + EPS) / TILE);
    for (int row = from - 1; row >= to && !ceil; row--)
      for (int c = l; c <= r; c++)
        if (SOLID(get(k, open, c, row))) { y = (row + 1) * TILE + h; vy = 0; ceil = 1; break; }
    if (!ceil) y = ny;
  }
  // ---- resting: a body within a hair of a floor stands on it
  if (!ground && vy >= 0) {
    int row = fl((y + 0.5) / TILE);
    double gap = y - row * TILE;
    if ((gap < 0 ? -gap : gap) < 0.6)
      for (int c = l; c <= r; c++) {
        int t = get(k, open, c, row);
        if (SOLID(t) || (t == T_ONEWAY && drop <= 0)) { ground = 1; gtile = t; y = row * TILE; break; }
      }
  }
  io[IO_X] = x; io[IO_Y] = y; io[IO_VX] = vx; io[IO_VY] = vy;
  io[IO_GROUND] = ground; io[IO_WALL] = wall; io[IO_CEIL] = ceil; io[IO_TILE] = gtile;
}

/** physics.ts moveBody on grid k: io holds the body (x, y, vx, vy, w, h, dropT, groundTile) and takes the result. */
__attribute__((export_name("move_body"))) void move_body(int k, unsigned mask, double dt, int collide) {
  k &= 1;
  if (io[IO_DROP] > 0) io[IO_DROP] -= dt;
  if (!collide) {
    io[IO_X] += io[IO_VX] * dt; io[IO_Y] += io[IO_VY] * dt;
    io[IO_GROUND] = 0; io[IO_WALL] = 0; io[IO_CEIL] = 0;
    return;
  }
  sweep(k, mask, 0, io[IO_VX] * dt, io[IO_VY] * dt);
}

static int fits(int k, unsigned mask, int open, double w, double h, double x, double y) {
  int l = fl((x - w / 2 + EPS) / TILE), r = fl((x + w / 2 - EPS) / TILE);
  int top = fl((y - h + EPS) / TILE), bot = fl((y - EPS) / TILE);
  for (int row = top; row <= bot; row++)
    for (int col = l; col <= r; col++)
      if (SOLID(get(k, open, col, row))) return 0;
  return 1;
}

/** physics.ts bodyFits (the caller has already refused a position that is not finite). */
__attribute__((export_name("body_fits"))) int body_fits(int k, unsigned mask, double w, double h, double x, double y) {
  return fits(k & 1, mask, 0, w, h, x, y);
}

/** physics.ts los, with its sample count n (worked out by the caller, as Math.hypot rounds its own way). */
__attribute__((export_name("los"))) int los(int k, unsigned mask, double x0, double y0, double x1, double y1, double n) {
  k &= 1;
  for (int i = 1; i < n; i++) {
    double t = i / n;
    if (SOLID(get(k, 0, fl((x0 + (x1 - x0) * t) / TILE), fl((y0 + (y1 - y0) * t) / TILE)))) return 0;
  }
  return 1;
}

/**
 * An Arcade body's step through grid k (open at its edges): io holds where it stood (x, y bottom-centre), its size,
 * the step (vx, vy as the displacement) and whether it drops through one-way platforms (dropT > 0). A body found
 * inside a wall is first eased out to the nearest free place within a tile (up first, then the sides, then down),
 * as Arcade's separation did. Returns how far it was eased.
 */
__attribute__((export_name("step_body"))) int step_body(int k, unsigned mask) {
  k &= 1;
  double x = io[IO_X], y = io[IO_Y], w = io[IO_W], h = io[IO_H];
  int eased = 0;
  if (!fits(k, mask, 1, w, h, x, y)) {
    for (int d = 1; d <= 16 && !eased; d++) {
      if (fits(k, mask, 1, w, h, x, y - d)) { y -= d; eased = d; }
      else if (fits(k, mask, 1, w, h, x - d, y)) { x -= d; eased = d; }
      else if (fits(k, mask, 1, w, h, x + d, y)) { x += d; eased = d; }
      else if (fits(k, mask, 1, w, h, x, y + d)) { y += d; eased = d; }
    }
    io[IO_X] = x; io[IO_Y] = y;
  }
  double dx = io[IO_VX], dy = io[IO_VY];
  io[IO_TILE] = 0;
  sweep(k, mask, 1, dx, dy);
  return eased;
}
