// ─────────────────────────────────────────────────────────────
//  Animated space backdrop
//  Layer 1 (WebGL): stars, nebula, a black hole with a glowing
//  accretion disk, a banded ringed gas giant, a cratered moon, and
//  a sun cresting over a big ocean planet's horizon.
//  Layer 2 (2D canvas): meteors, fireballs, and debris spiralling
//  into the black hole.
// ─────────────────────────────────────────────────────────────
(function () {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bg = document.createElement("canvas");
  bg.id = "space-bg";
  const fx = document.createElement("canvas");
  fx.id = "space-fx";
  document.body.prepend(fx);
  document.body.prepend(bg);

  // Shared scene geometry (the shader and the 2D layer must agree)
  const scene = {
    bh() {
      const asp = innerWidth / innerHeight;
      // Upper right on wide screens, upper middle on phones
      const x = asp > 1 ? asp * 0.5 - 0.2 : asp * 0.5 - 0.1;
      const y = asp > 1 ? 0.33 : 0.38;
      return [x, y];
    },
  };

  const INTRO_SECONDS = 5;
  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
  const zoomAt = (t) => 1.45 - 0.45 * ease(t / INTRO_SECONDS); // camera pushes in
  const sizeK = () => Math.min(1, (innerWidth / innerHeight) * 1.25);
  const rsAt = (t) => 0.058 * sizeK() * (0.35 + 0.65 * ease((t - 0.3) / (INTRO_SECONDS - 0.3))) * (1 + 0.04 * Math.sin(t * 0.3));

  // ── WebGL layer ────────────────────────────────────────────
  const gl = bg.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });

  const FRAG = `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uZoom;
  uniform float uRs;
  uniform vec2 uBH;
  uniform float uScroll;

  #define PI 3.14159265

  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; }
    return v;
  }
  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  // Accretion disk colour at disk radius R and orbit angle a (angle 0 = right, PI = left).
  // Fine orbital streaks, hot white inner edge fading to deep red, and Doppler beaming:
  // the left side is spinning toward us, so it is brighter and bluer.
  vec3 diskShade(float R, float a, float rs, float inner, float outer){
    float x = (R - inner)/(outer - inner);
    if (x <= 0.0 || x >= 1.0) return vec3(0.0);
    float aa = a - uTime*1.1*pow(inner/R, 1.5);
    vec2 cs = vec2(cos(aa), sin(aa));
    float streak = fbm(cs*2.2 + vec2(R/rs*4.5, R/rs*0.9));
    float fine = noise(cs*6.0 + vec2(R/rs*9.0, 0.0));
    float rings = 0.82 + 0.18*sin(R/rs*13.0 + streak*5.0);
    float tex = (0.2 + 1.7*streak*streak)*(0.75 + 0.45*fine)*rings;
    float temp = pow(1.0 - x, 2.2);
    float profile = smoothstep(0.0, 0.03, x)*smoothstep(1.0, 0.45, x);
    vec3 c = mix(vec3(0.7, 0.12, 0.03), vec3(1.0, 0.5, 0.15), smoothstep(0.0, 0.35, temp));
    c = mix(c, vec3(1.0, 0.93, 0.82), smoothstep(0.35, 0.85, temp));
    float g = 1.0 - 0.5*cos(a);                     // 0.5 on the receding side, 1.5 approaching
    float beam = g*g*g;
    c = mix(c, c*vec3(0.85, 0.95, 1.25), smoothstep(1.1, 1.5, g)*0.6);
    return c*(0.12 + 2.6*temp)*tex*profile*beam;
  }

  // crater field: dark bowls with a bright raised rim
  float craters(vec2 x){
    vec2 i = floor(x), f = fract(x);
    float c = 0.0;
    for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++){
      vec2 g = vec2(float(j), float(k));
      vec2 o = vec2(hash(i+g), hash(i+g+7.0));
      float rad = 0.18 + 0.3*hash(i+g+3.0);
      float d = length(g + o - f)/rad;
      float on = step(0.35, hash(i+g+11.0));
      c += on*(-0.55*smoothstep(1.0, 0.6, d) + 0.45*smoothstep(0.75, 1.0, d)*smoothstep(1.3, 1.0, d));
    }
    return c;
  }

  vec3 stars(vec2 uv, float scale, float seed){
    vec2 g = uv*scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float h = hash(id + seed);
    if (h < 0.9) return vec3(0.0);
    vec2 off = (vec2(hash(id+seed+3.1), hash(id+seed+9.7)) - 0.5)*0.7;
    float d = length(f - off);
    float b = (h - 0.9)/0.1;
    float core = smoothstep(0.05 + 0.1*b*b, 0.0, d);
    float glow = exp(-d*d*60.0)*b*0.35;
    float tw = 0.6 + 0.4*sin(uTime*(0.7 + h*3.0) + h*60.0);
    vec3 c = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.85, 0.7), hash(id+seed+5.0));
    return c*(core + glow)*tw*(0.45 + b);
  }

  void main(){
    float asp = uRes.x/uRes.y;
    vec2 p = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
    p *= uZoom;

    // ── black hole lensing of the background ──
    vec2 d = p - uBH;
    float r = length(d);
    float rs = uRs;
    float bend = rs*rs*3.2/max(r, 1e-4);
    vec2 q = p - normalize(d)*bend*smoothstep(rs*0.9, rs*1.3, r);
    q = uBH + rot(rs*rs*6.0/max(r*r, 1e-4)*0.05)*(q - uBH);   // a little swirl
    vec2 bgq = q + vec2(0.0, uScroll*0.06);

    // deep-space base
    vec3 col = mix(vec3(0.006, 0.008, 0.022), vec3(0.02, 0.012, 0.04), smoothstep(-0.6, 0.6, p.y));

    // nebula
    vec2 nq = bgq*1.2 + vec2(uTime*0.004, 0.0);
    float n  = fbm(nq*1.1 + fbm(nq*0.7 + 3.0)*1.6);
    float n2 = fbm(nq*2.2 - 7.0 + uTime*0.003);
    float band = exp(-pow((bgq.y + bgq.x*0.38 - 0.05)*2.0, 2.0));
    vec3 neb = vec3(0.42, 0.07, 0.5)*pow(n, 3.0)*1.7 + vec3(0.04, 0.22, 0.55)*pow(n2, 3.0)*1.5 + vec3(0.6, 0.15, 0.2)*pow(n*n2, 2.5)*1.2;
    col += neb*(0.35 + band*1.3);

    // stars, three depths
    col += stars(bgq, 38.0, 0.0) + stars(bgq*1.01, 80.0, 11.0)*0.8 + stars(bgq*1.02, 170.0, 23.0)*0.55;
    col += vec3(0.55, 0.65, 1.0)*pow(fbm(bgq*7.0), 5.0)*band*0.9;   // star dust

    // ── black hole ──
    // A thin disk seen almost edge on. Its far half is bent up over the shadow (and a thin
    // copy under it), ringed by a sharp photon ring.
    vec2 dd = rot(0.28)*d;
    float incl = 0.16;
    float inner = rs*1.6, outer = rs*6.2;
    vec2 e = vec2(dd.x, dd.y/incl);
    float er = length(e);
    float ea = atan(e.y, e.x);
    vec3 diskDirect = vec3(0.0);
    if (er < outer*1.05) diskDirect = diskShade(er, ea, rs, inner, outer);
    float front = smoothstep(0.004*rs, -0.004*rs, dd.y);

    col += diskDirect*(1.0 - front)*smoothstep(rs*1.0, rs*1.04, r);   // far half, peeking above the shadow
    col *= smoothstep(rs*0.985, rs*1.015, r);                           // event horizon shadow

    // lensed image of the far half of the disk, wrapped over the top and thinner underneath
    float ang = atan(dd.y, dd.x);
    float up = sin(ang);
    float thick = mix(0.45, 1.0, smoothstep(-0.5, 0.4, up));
    float lr = (r - rs*1.07)/(rs*1.15*thick);
    if (lr > 0.0 && lr < 1.0){
      float lensR = inner + lr*lr*(outer - inner)*0.7;
      float lensA = up >= 0.0 ? ang : -ang;                                // mirror so the bottom copy matches the top
      vec3 arc = diskShade(lensR, lensA, rs, inner, outer);
      float fadeOut = smoothstep(1.0, 0.55, lr);
      col += arc*fadeOut*mix(0.35, 1.0, smoothstep(-0.3, 0.3, up))*0.9;
    }

    // photon ring: a razor-thin bright circle right at the edge of the shadow
    float pring = exp(-pow((r - rs*1.035)/(rs*0.014), 2.0));
    col += vec3(1.0, 0.86, 0.66)*pring*(0.9 + 0.8*smoothstep(0.3, -1.0, cos(ang)))*1.4;

    col += diskDirect*front;                                              // near half, in front of the shadow
    // faint bloom so it sits in the scene instead of on top of it
    col += vec3(1.0, 0.5, 0.2)*exp(-max(r - rs, 0.0)/(rs*1.6))*0.09*step(rs, r);

    // ── sun and the big planet ──
    vec2 bc = vec2(-0.08*asp, -1.62);
    float br = 1.3;
    vec2 bp = p - bc;
    float bd = length(bp);
    float sa = 1.36 + 0.015*sin(uTime*0.05);
    vec2 sunDir = vec2(cos(sa), sin(sa));
    vec2 sunPos = bc + sunDir*(br + 0.004);
    float inside = smoothstep(br + 0.0025, br - 0.0025, bd);
    float facing = max(dot(normalize(bp), sunDir), 0.0);

    // atmosphere
    float atm = exp(-max(bd - br, 0.0)*16.0)*(1.0 - inside);
    col += vec3(0.25, 0.5, 1.0)*atm*(0.18 + 1.6*pow(facing, 10.0));
    col += vec3(1.0, 0.55, 0.25)*atm*pow(facing, 40.0)*1.2;

    // planet surface: oceans, continents and clouds on the day side, city lights on the night side
    float depth = br - bd;
    if (inside > 0.0){
      vec2 sv = bp/br;
      vec3 n3 = vec3(sv, sqrt(max(0.0, 1.0 - dot(sv, sv))));
      vec3 S3 = normalize(vec3(sunDir, -0.32));                  // sun sits just behind the horizon
      float dayL = max(dot(n3, S3), 0.0);
      float twi = smoothstep(-0.12, 0.25, dot(n3, S3));          // soft day/night line
      // stretch the texture toward the horizon so it reads as a curved surface
      vec2 tc = vec2(bp.x, bp.y*2.6 - depth*6.0)*2.2;
      float cont = fbm(tc*0.9 + vec2(4.0, 1.3) + 0.4*fbm(tc*2.0));
      float land = smoothstep(0.5, 0.56, cont);
      float relief = fbm(tc*4.0);
      vec3 ocean = mix(vec3(0.004, 0.03, 0.12), vec3(0.01, 0.1, 0.26), smoothstep(0.35, 0.5, cont));
      vec3 ground = mix(vec3(0.05, 0.1, 0.035), vec3(0.17, 0.11, 0.05), smoothstep(0.35, 0.7, relief));
      vec3 surfDay = mix(ocean, ground, land);
      vec2 cq = tc*1.6 + vec2(uTime*0.006, 0.0);
      float cl = fbm(cq + 1.4*fbm(cq*0.8 + 2.0));
      float clouds = smoothstep(0.56, 0.8, cl);
      surfDay = mix(surfDay, vec3(0.75, 0.82, 0.95), clouds*0.7);
      surfDay += vec3(1.0, 0.85, 0.6)*pow(max(dot(reflect(-S3, n3), vec3(0.0, 0.0, 1.0)), 0.0), 30.0)*(1.0 - land)*(1.0 - clouds)*0.6; // sun glint on water
      vec3 surf = surfDay*(0.15 + dayL)*0.95*twi;
      surf += vec3(1.0, 0.45, 0.2)*clouds*twi*(1.0 - twi)*0.25;    // orange cloud tops at sunset
      // night side
      vec3 night = vec3(0.008, 0.012, 0.03) + vec3(0.02, 0.035, 0.06)*clouds;
      float lights = smoothstep(0.6, 0.78, fbm(bp*26.0))*land*(1.0 - clouds)*smoothstep(0.02, 0.15, depth);
      night += vec3(1.0, 0.68, 0.32)*lights*0.5;
      surf += night*(1.0 - twi);
      // thin bright crescent along the limb
      float cres = exp(-depth*22.0)*pow(facing, 5.0);
      surf += vec3(0.35, 0.65, 1.0)*cres*1.3 + vec3(1.0, 0.65, 0.35)*cres*pow(facing, 12.0)*1.2;
      surf += vec3(0.2, 0.35, 0.8)*exp(-depth*70.0)*0.35;
      col = mix(col, surf, inside);
    }

    // the sun itself, peeking over the edge
    vec2 sd = p - sunPos;
    float sdist = length(sd);
    float core  = 0.0018/(sdist*sdist + 0.0018);
    float wide  = exp(-sdist*3.2)*0.55;
    float streak = exp(-abs(sd.y)*110.0)*exp(-abs(sd.x)*2.2)*1.1;
    float a = atan(sd.y, sd.x);
    float rays = (pow(0.5 + 0.5*sin(a*11.0 + uTime*0.08), 10.0) + pow(0.5 + 0.5*sin(a*7.0 - uTime*0.05 + 1.3), 12.0))*exp(-sdist*5.0)*0.35;
    vec3 sun = (core*1.8*(1.0 - inside*0.85) + wide + streak + rays)*vec3(1.0, 0.83, 0.62);
    col += sun;

    // ── ringed gas giant ──
    vec2 pc = asp > 1.0 ? vec2(-asp*0.5 + 0.02, 0.04) : vec2(-asp*0.5 + 0.02, -0.3);
    float pr = asp > 1.0 ? 0.11 : 0.075;
    vec2 lp = p - pc;
    vec2 rp = rot(-0.38)*lp;
    vec2 L = normalize(sunPos - pc);
    vec3 L3 = normalize(vec3(L, 0.3));
    float pd = length(lp);
    float pin = smoothstep(pr, pr - 0.0025, pd);

    // rings: several bands, a dark gap, fine grooves, lit from the sun and shadowed by the planet
    float rr = length(vec2(rp.x, rp.y/0.27))/pr;
    float ringBand = smoothstep(1.3, 1.36, rr)*smoothstep(2.42, 2.3, rr);
    float gaps = (1.0 - 0.9*exp(-pow((rr - 1.88)/0.04, 2.0)))*(1.0 - 0.55*exp(-pow((rr - 2.18)/0.018, 2.0)))*(1.0 - 0.6*smoothstep(1.55, 1.36, rr));
    float grooves = 0.62 + 0.22*sin(rr*71.0) + 0.16*sin(rr*29.0 + 1.3);
    float ringTex = grooves*(0.75 + 0.25*noise(vec2(rr*120.0, 0.5)))*gaps;
    vec3 ringTint = mix(vec3(0.7, 0.52, 0.38), vec3(0.98, 0.9, 0.76), smoothstep(1.4, 2.2, rr));
    float along = dot(lp, L);
    float across = length(lp - along*L);
    // the planet's shadow falls on the part of the rings behind it, away from the sun
    float shadowed = smoothstep(0.0, -pr*0.25, along)*smoothstep(pr*1.04, pr*0.94, across)*step(0.0, rp.y);
    float inShadow = 1.0 - shadowed;   // 1 = lit
    vec3 ringCol = ringTint*ringBand*ringTex*(0.15 + 0.85*inShadow)*0.9;

    // soft glow of the atmosphere around the disc
    float rim = exp(-max(pd - pr, 0.0)/pr*12.0)*(1.0 - pin);
    col += vec3(1.0, 0.68, 0.42)*rim*(0.08 + 0.5*pow(max(dot(normalize(lp), L), 0.0), 2.0));
    col += ringCol*step(0.0, rp.y)*(1.0 - pin)*0.85;               // back half of the rings

    if (pin > 0.0){
      vec3 nrm = vec3(lp/pr, sqrt(max(0.0, 1.0 - dot(lp, lp)/(pr*pr))));
      vec3 tn = vec3(rot(-0.38)*nrm.xy, nrm.z);                    // normal in the planet's own frame
      float lat = tn.y;
      float lon = atan(tn.x, tn.z);
      vec2 sc = vec2(lon*1.6 + uTime*0.012, lat*5.0);
      float w = fbm(sc*vec2(1.2, 0.7) + vec2(0.0, uTime*0.004));
      float swirl = fbm(vec2(lon*5.0 - uTime*0.02, lat*28.0 + w*4.0));
      float b = lat*11.0 + (w - 0.5)*2.4 + (swirl - 0.5)*1.2;
      float bands = smoothstep(-0.6, 0.6, sin(b));
      vec3 base = mix(vec3(0.6, 0.36, 0.2), vec3(0.9, 0.74, 0.52), bands);
      base = mix(base, vec3(0.98, 0.93, 0.82), smoothstep(0.62, 0.85, swirl)*0.55);
      base = mix(base, vec3(0.42, 0.22, 0.14), smoothstep(0.55, 0.3, swirl)*0.35*bands);
      // a big storm with a lighter core
      vec2 st = vec2((lon - 0.45)*1.2, (lat + 0.34)*3.2);
      float storm = exp(-dot(st, st)*9.0);
      float stormSwirl = fbm(rot(length(st)*6.0 - uTime*0.1)*st*4.0);
      base = mix(base, mix(vec3(0.78, 0.3, 0.16), vec3(0.95, 0.6, 0.4), stormSwirl), storm*0.85);
      float diff = pow(clamp((dot(nrm, L3) + 0.2)/1.2, 0.0, 1.0), 1.6);
      float term = smoothstep(-0.25, 0.25, dot(nrm, L3));
      vec3 pcol = base*(0.025 + diff*1.1)*mix(0.7, 1.0, nrm.z);
      pcol += vec3(1.0, 0.55, 0.3)*term*(1.0 - term)*0.12;          // warm glow along the day/night line
      pcol += vec3(1.0, 0.75, 0.5)*pow(1.0 - nrm.z, 3.0)*diff*0.7;  // hazy lit rim
      // the rings cast a thin shadow band across the planet
      vec2 sh = rot(-0.38)*(lp + L*pr*0.08);
      float srr = length(vec2(sh.x, sh.y/0.27))/pr;
      float ringShadow = smoothstep(1.3, 1.38, srr)*smoothstep(2.4, 2.3, srr)*step(sh.y, 0.0);
      pcol *= 1.0 - 0.45*ringShadow*diff;
      col = mix(col, pcol, pin);
    }
    col = mix(col, col*0.2 + ringCol*1.25, step(rp.y, 0.0)*ringBand*0.9*smoothstep(0.1, 0.4, gaps));   // front half over the planet

    // small rusty moon with craters and a polar cap
    vec2 mc = asp > 1.0 ? vec2(0.06, 0.4) : vec2(0.16, -0.2);
    vec2 mp = p - mc; float mr = asp > 1.0 ? 0.03 : 0.024;
    float min_ = smoothstep(mr, mr - 0.002, length(mp));
    if (min_ > 0.0){
      vec3 mn = vec3(mp/mr, sqrt(max(0.0, 1.0 - dot(mp, mp)/(mr*mr))));
      vec2 muv = mn.xy/(0.6 + 0.4*mn.z);                        // wrap the texture around the sphere
      float maria = fbm(muv*2.5 + 9.0);
      vec3 mbase = mix(vec3(0.78, 0.38, 0.22), vec3(0.45, 0.2, 0.14), smoothstep(0.45, 0.7, maria));
      mbase *= 1.0 + 0.6*craters(muv*4.0) + 0.35*craters(muv*9.0 + 3.0);
      mbase = mix(mbase, vec3(0.95, 0.92, 0.9), smoothstep(0.78, 0.86, mn.y + 0.05*noise(muv*12.0)));
      vec3 mL = normalize(vec3(normalize(sunPos - mc), 0.2));
      float md = max(dot(mn, mL), 0.0);
      vec3 mcol = mbase*(0.03 + md*1.15);
      mcol += vec3(1.0, 0.6, 0.4)*pow(1.0 - mn.z, 3.0)*md*0.5;
      col = mix(col, mcol, min_);
    }
    col += vec3(1.0, 0.5, 0.3)*exp(-max(length(mp) - mr, 0.0)/mr*10.0)*(1.0 - min_)*0.06;

    // finish
    vec2 uv = gl_FragCoord.xy/uRes;
    col *= 1.0 - 0.45*pow(length(uv - 0.5)*1.25, 2.2);   // vignette
    col = 1.0 - exp(-col*1.35);                          // tone map
    col += (hash(gl_FragCoord.xy + uTime) - 0.5)/255.0;  // dither
    gl_FragColor = vec4(col, 1.0);
  }`;

  const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

  let prog = null, U = {};
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (vs && fs) {
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null;
    }
    if (prog) {
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ["uRes", "uTime", "uZoom", "uRs", "uBH", "uScroll"]) U[n] = gl.getUniformLocation(prog, n);
    }
  }
  if (!prog) document.documentElement.classList.add("no-webgl");

  // ── 2D effects layer ───────────────────────────────────────
  const ctx = fx.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  function resize() {
    W = innerWidth; H = innerHeight;
    // The backdrop is soft, so render it below full resolution to stay light on the GPU
    const scale = Math.min(1, 1400 / Math.max(W, H)) * Math.min(devicePixelRatio || 1, 1.25);
    bg.width = Math.round(W * scale); bg.height = Math.round(H * scale);
    if (prog) gl.viewport(0, 0, bg.width, bg.height);
    DPR = Math.min(devicePixelRatio || 1, 1.5);
    fx.width = Math.round(W * DPR); fx.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  // glow sprite reused for meteor heads, sparks and debris
  function sprite(stops) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const glowWhite = sprite([[0, "rgba(255,255,255,1)"], [0.25, "rgba(190,220,255,0.7)"], [1, "rgba(120,170,255,0)"]]);
  const glowFire = sprite([[0, "rgba(255,250,220,1)"], [0.2, "rgba(255,190,90,0.85)"], [0.55, "rgba(255,90,30,0.35)"], [1, "rgba(255,40,0,0)"]]);

  const meteors = [];
  const sparks = [];
  const debris = [];
  let nextMeteor = 1.2;

  function spawnMeteor(big) {
    const fireball = big || Math.random() < 0.18;
    const fromRight = Math.random() < 0.72;          // mostly falling down-left, some down-right
    const ang = 0.45 + Math.random() * 0.4;          // angle below the horizontal
    const speed = fireball ? 380 + Math.random() * 260 : 700 + Math.random() * 900;
    meteors.push({
      x: fromRight ? W * (0.35 + Math.random() * 0.75) : W * (-0.1 + Math.random() * 0.6),
      y: -40 - Math.random() * H * 0.15,
      vx: (fromRight ? -1 : 1) * Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      len: fireball ? 260 + Math.random() * 200 : 120 + Math.random() * 220,
      w: fireball ? 4 + Math.random() * 3 : 1.2 + Math.random() * 1.6,
      fireball,
      life: 0,
    });
  }

  function bhScreen(t) {
    const [bx, by] = scene.bh();
    const z = zoomAt(t);
    return { x: W / 2 + (bx / z) * H, y: H / 2 - (by / z) * H, rs: (rsAt(t) / z) * H };
  }

  function spawnDebris(bh) {
    debris.push({
      a: Math.random() * Math.PI * 2,
      r: bh.rs * (5 + Math.random() * 4),
      size: 1 + Math.random() * 2.2,
      hot: Math.random(),
    });
  }

  function drawFx(t, dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    // debris spiralling into the black hole, on the disk's tilted plane
    const bh = bhScreen(t);
    if (t > 2.5) while (debris.length < 40) spawnDebris(bh);
    const tilt = 0.28, flat = 0.16;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      const w = 2.2 * Math.pow(bh.rs / d.r, 1.5) * 3;
      d.a += w * dt;
      d.r -= dt * bh.rs * (0.25 + 1.6 * Math.pow(bh.rs / d.r, 2));
      if (d.r < bh.rs * 1.15) { debris.splice(i, 1); continue; }
      const ex = Math.cos(d.a) * d.r, ey = Math.sin(d.a) * d.r * flat;
      const x = bh.x + ex * Math.cos(tilt) + ey * Math.sin(tilt);
      const y = bh.y - (-ex * Math.sin(tilt) + ey * Math.cos(tilt));
      const behind = Math.sin(d.a) > 0 && Math.hypot(x - bh.x, y - bh.y) < bh.rs * 1.05;
      if (behind) continue;
      const heat = 1 - (d.r - bh.rs) / (bh.rs * 9);
      const s = d.size * (1.2 + heat * 2);
      ctx.globalAlpha = 0.25 + 0.6 * heat;
      ctx.drawImage(d.hot > 0.5 ? glowFire : glowWhite, x - s, y - s, s * 2, s * 2);
    }

    // meteors
    nextMeteor -= dt;
    if (nextMeteor <= 0) {
      spawnMeteor();
      if (Math.random() < 0.15) { spawnMeteor(); spawnMeteor(); } // a little shower
      nextMeteor = 0.9 + Math.random() * 2.2;
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx * dt; m.y += m.vy * dt; m.life += dt;
      const sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      if (ty > H + 60 || m.x < -m.len - 60 || m.x > W + m.len + 60) { meteors.splice(i, 1); continue; }
      const fade = Math.min(1, m.life * 4);
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      if (m.fireball) {
        g.addColorStop(0, `rgba(255,245,220,${0.95 * fade})`);
        g.addColorStop(0.15, `rgba(255,170,70,${0.8 * fade})`);
        g.addColorStop(0.5, `rgba(255,70,30,${0.35 * fade})`);
        g.addColorStop(1, "rgba(120,20,60,0)");
      } else {
        g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        g.addColorStop(0.3, `rgba(170,210,255,${0.45 * fade})`);
        g.addColorStop(1, "rgba(120,160,255,0)");
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineCap = "round";
      ctx.lineWidth = m.w;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      if (m.fireball) {
        ctx.lineWidth = m.w * 3.5; ctx.globalAlpha = 0.18 * fade;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - (m.vx / sp) * m.len * 0.5, m.y - (m.vy / sp) * m.len * 0.5); ctx.stroke();
        for (let k = 0; k < 2; k++) {
          sparks.push({ x: m.x, y: m.y, vx: m.vx * 0.15 + (Math.random() - 0.5) * 120, vy: m.vy * 0.15 + (Math.random() - 0.5) * 120, life: 0, max: 0.4 + Math.random() * 0.6 });
        }
      }
      const hs = m.fireball ? m.w * 7 : m.w * 5;
      ctx.globalAlpha = fade;
      ctx.drawImage(m.fireball ? glowFire : glowWhite, m.x - hs, m.y - hs, hs * 2, hs * 2);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life > s.max) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97;
      const k = 1 - s.life / s.max;
      ctx.globalAlpha = k;
      const sz = 3 + 5 * k;
      ctx.drawImage(glowFire, s.x - sz, s.y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawBg(t) {
    if (!prog) return;
    const [bx, by] = scene.bh();
    gl.uniform2f(U.uRes, bg.width, bg.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uZoom, zoomAt(t));
    gl.uniform1f(U.uRs, rsAt(t));
    gl.uniform2f(U.uBH, bx, by);
    gl.uniform1f(U.uScroll, Math.min(scrollY / Math.max(H, 1), 6));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (reduceMotion) {
    const still = INTRO_SECONDS + 20;
    const paint = () => { resize(); drawBg(still); };
    paint();
    addEventListener("resize", paint);
    addEventListener("scroll", () => drawBg(still), { passive: true });
    return;
  }

  // ?t=20 skips ahead (used for screenshots)
  const skip = parseFloat(new URLSearchParams(location.search).get("t")) || 0;
  let start = performance.now() - skip * 1000, last = performance.now(), frame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = (now - start) / 1000;
    // The shader runs at 30 fps (it's slow-moving), the meteors at full rate
    if (frame++ % 2 === 0) drawBg(t);
    drawFx(t, dt);
  }
  requestAnimationFrame(loop);
})();
