//Just fixed the tracer(0) issue - this should be stable!
// py_worker.js (with tracer/update) (type: module)
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs";

let pyodide = null;
let pendingInputResolve = null;

function post(type, data = {}) {
  self.postMessage({ type, ...data });
}

// Convert Pyodide proxies / Maps / dicts into a plain JS object
function toPlainObject(x) {
  if (x && typeof x === "object" && typeof x.toJs === "function") {
    const converted = x.toJs({ dict_converter: Object.fromEntries });
    return toPlainObject(converted);
  }
  if (x instanceof Map) return Object.fromEntries(x.entries());
  if (Array.isArray(x)) return x.map(toPlainObject);
  if (x && typeof x === "object") {
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = toPlainObject(v);
    return out;
  }
  return x;
}

async function ensurePyodide() {
  if (pyodide) return;

  post("status", { text: "Loading Python…" });
  pyodide = await loadPyodide();

  pyodide.setStdout({ batched: s => post("stdout", { text: s }) });
  pyodide.setStderr({ batched: s => post("stderr", { text: s }) });

  // async input() -> UI
  pyodide.globals.set("__worker_console_input__", (prompt) => {
    post("input_request", { prompt: String(prompt ?? "") });
    return new Promise(resolve => { pendingInputResolve = resolve; });
  });

  // Canvas bridge: Python -> worker -> UI
  pyodide.globals.set("__canvas_cmd__", (obj) => {
    const cmd = toPlainObject(obj);
    post("canvas_cmd", { cmd });
  });

  // Install async input
  await pyodide.runPythonAsync(`
import builtins
async def _input(prompt=""):
    return await __worker_console_input__(str(prompt))
builtins.input = _input
  `);

  // Install browser turtle module named "turtle"
  await pyodide.runPythonAsync(`
import math, types, sys

def _cmd(**kwargs):
    __canvas_cmd__(kwargs)

TRACER_N = 1

def tracer(n=None, delay=None):
    global TRACER_N
    if n is None:
        return TRACER_N
    try:
        n = int(n)
    except Exception:
        return TRACER_N
    TRACER_N = n
    _cmd(type="tracer", n=TRACER_N, delay=delay)
    return TRACER_N

def update():
    _cmd(type="update")

def _emit_state(t):
    _cmd(type="turtle",
         x=t.x, y=t.y,
         heading=t.heading,
         visible=t._visible,
         pencolor=t._pencolor)


def _normalize_color(*args):
    # color("red") or color("#ff0000")
    if len(args) == 1 and isinstance(args[0], str):
        return args[0]

    # color((r, g, b)) or color([r, g, b])
    if len(args) == 1 and isinstance(args[0], (tuple, list)):
        args = tuple(args[0])

    # color(r, g, b)
    if len(args) == 3:
        r, g, b = args
        r = max(0, min(255, int(r)))
        g = max(0, min(255, int(g)))
        b = max(0, min(255, int(b)))
        return f"rgb({r},{g},{b})"

    raise ValueError("bad color argument")


class _WebTurtle:
    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.heading = 0.0   # degrees, 0 = east
        self._pendown = True
        self._pencolor = "#00ff66"
        self._pensize = 2.0
        self._speed = 0      # 0 = instant
        self._visible = True
        _emit_state(self)

    def _line_to(self, nx, ny):
        if self._pendown:
            _cmd(
                type="line",
                x1=self.x, y1=self.y,
                x2=nx, y2=ny,
                color=self._pencolor,
                width=self._pensize,
                speed=self._speed
            )
        self.x, self.y = float(nx), float(ny)
        _emit_state(self)

    def forward(self, d):
        r = math.radians(self.heading)
        nx = self.x + math.cos(r) * float(d)
        ny = self.y + math.sin(r) * float(d)
        self._line_to(nx, ny)

    def backward(self, d):
        self.forward(-float(d))

    def left(self, deg):
        self.heading = (self.heading + float(deg)) % 360.0
        _emit_state(self)

    def right(self, deg):
        self.heading = (self.heading - float(deg)) % 360.0
        _emit_state(self)

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._line_to(float(x), float(y))

    def setpos(self, x, y=None):
        self.goto(x, y)

    def setposition(self, x, y=None):
        self.goto(x, y)

    def penup(self): self._pendown = False
    def pendown(self): self._pendown = True

    def pencolor(self, c=None):
        if c is None: return self._pencolor
        self._pencolor = str(c)
        _emit_state(self)
    def color(self, *args):
        if len(args) == 0:
            return self._pencolor
        self._pencolor = _normalize_color(*args)
        _emit_state(self)


    def pensize(self, w=None):
        if w is None: return self._pensize
        self._pensize = float(w)

    def speed(self, s=None):
        if s is None:
            return self._speed
        try:
            s = int(s)
        except:
            return
        if s < 0: s = 0
        if s > 10: s = 10
        self._speed = s

    def hideturtle(self):
        self._visible = False
        _emit_state(self)

    def ht(self): self.hideturtle()

    def showturtle(self):
        self._visible = True
        _emit_state(self)

    def st(self): self.showturtle()

    def clear(self):
        _cmd(type="clear")
        _emit_state(self)

    def bgcolor(self, c):
        _cmd(type="bg", color=str(c))
        _emit_state(self)

    def home(self):
        self.goto(0, 0)
        self.heading = 0.0
        _emit_state(self)

    def setheading(self, deg):
        self.heading = float(deg) % 360.0
        _emit_state(self)

# shared default turtle
_T = _WebTurtle()

def reset():
    _cmd(type="clear")
    _cmd(type="bg", color="#111111")
    global _T
    _T = _WebTurtle()

# module-level wrappers (like real turtle)
def forward(d): _T.forward(d)
def fd(d): _T.forward(d)
def backward(d): _T.backward(d)
def bk(d): _T.backward(d)
def left(a): _T.left(a)
def lt(a): _T.left(a)
def right(a): _T.right(a)
def rt(a): _T.right(a)
def goto(x, y=None): _T.goto(x, y)
def setpos(x, y=None): _T.setpos(x, y)
def setposition(x, y=None): _T.setposition(x, y)
def penup(): _T.penup()
def pu(): _T.penup()
def pendown(): _T.pendown()
def pd(): _T.pendown()
def pencolor(c=None): return _T.pencolor(c)
def pensize(w=None): return _T.pensize(w)
def width(w=None): return _T.pensize(w)
def speed(s=None): return _T.speed(s)
def hideturtle(): _T.hideturtle()
def ht(): _T.ht()
def showturtle(): _T.showturtle()
def st(): _T.st()
def clear(): _T.clear()
def bgcolor(c): _T.bgcolor(c)
def home(): _T.home()
def setheading(a): _T.setheading(a)

class Turtle(_WebTurtle):
    pass

class Screen:
    def bgcolor(self, c): bgcolor(c)
    def clearscreen(self): clear()
    def reset(self): reset()
    def tracer(self, n=None, delay=None): return tracer(n, delay)
    def update(self): return update()

# Create module object "turtle"
turtle = types.ModuleType("turtle")
for _name, _obj in list(globals().items()):
    if _name.startswith("_"):
        continue
    setattr(turtle, _name, _obj)

sys.modules["turtle"] = turtle
  `);

  post("ready");
}

function wrapUserCode(src) {
  const t = src.replace(/(^|[^\w.])input\s*\(/g, "$1await input(");
  const i = t.split("\n").map(l => "    " + l);
  return ["async def __main__():", ...i, "", "await __main__()"].join("\n");
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      await ensurePyodide();
      return;
    }

    if (msg.type === "run") {
      await ensurePyodide();

      // reset turtle each run (Trinket-like)
      post("canvas_cmd", { cmd: { type: "clear" } });
      post("canvas_cmd", { cmd: { type: "bg", color: "#111111" } });
      await pyodide.runPythonAsync(`import turtle; turtle.reset()`);

      post("status", { text: "Running…" });
      const code = wrapUserCode(msg.code ?? "");
      await pyodide.runPythonAsync(code);
      post("done");
      return;
    }

    if (msg.type === "input_response") {
      if (pendingInputResolve) {
        pendingInputResolve(String(msg.text ?? ""));
        pendingInputResolve = null;
      }
      return;
    }
  } catch (e) {
    post("error", { text: String(e) });
  }
};
