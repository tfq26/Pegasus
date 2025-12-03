<template>
  <div
    data-slot="black-hole-background"
    :class="[
      'relative size-full overflow-hidden bg-background',
      `before:absolute before:left-1/2 before:top-1/2 before:block before:size-[140%] before:content-[''] before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,hsl(var(--foreground))_50%)] before:[transform:translate3d(-50%,-50%,0)] before:opacity-20 dark:before:opacity-100 dark:before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,black_50%)]`,
      `after:absolute after:left-1/2 after:top-1/2 after:z-[5] after:block after:size-full after:mix-blend-overlay after:content-[''] after:[background:radial-gradient(ellipse_at_50%_75%,hsl(var(--primary))_20%,transparent_75%)] after:[transform:translate3d(-50%,-50%,0)] after:opacity-60 dark:after:opacity-100`,
    ]"
    v-bind="props"
  >
    <slot></slot>
    <canvas
      ref="canvasRef"
      class="absolute inset-0 block size-full opacity-30 dark:opacity-20"
    />
    <motion.div
      :class="[
        'absolute left-1/2 top-[-71.5%] z-[3] h-[140%] w-[30%] rounded-b-full opacity-75 mix-blend-plus-darker blur-3xl [background-position:0%_100%] [background-size:100%_200%] [transform:translate3d(-50%,0,0)] dark:mix-blend-plus-lighter',
        '[background:linear-gradient(20deg,hsl(var(--primary)),hsl(var(--secondary))_16.5%,hsl(var(--accent))_33%,hsl(var(--accent))_49.5%,hsl(var(--primary))_66%,hsl(var(--primary))_85.5%,hsl(var(--secondary))_100%)_0_100%_/_100%_200%]',
      ]"
      :animate="{ backgroundPosition: '0% 300%' }"
      :transition="{ duration: 5, ease: 'linear', repeat: Infinity }"
    />
    <div
      class="absolute left-0 top-0 z-[7] size-full opacity-50 mix-blend-overlay dark:[background:repeating-linear-gradient(transparent,transparent_1px,white_1px,white_2px)] [background:repeating-linear-gradient(transparent,transparent_1px,hsl(var(--border))_1px,hsl(var(--border))_2px)]"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from "vue";
import { motion } from "motion-v";

const props = defineProps({
  strokeColor: { type: String, required: false },
  numberOfLines: { type: Number, required: false, default: 50 },
  numberOfDiscs: { type: Number, required: false, default: 50 },
  particleRGBColor: {
    type: Array,
    required: false,
    default: () => [100, 100, 100], // Darker default for light mode visibility
  },
  class: { type: String, required: false },
});

const canvasRef = ref(null);
const animationFrameIdRef = ref(0);
const stateRef = ref({
  discs: [],
  lines: [],
  particles: [],
  clip: {},
  startDisc: { p: 0, x: 0, y: 0, w: 0, h: 0 },
  endDisc: { p: 0, x: 0, y: 0, w: 0, h: 0 },
  rect: { width: 0, height: 0 },
  render: { width: 0, height: 0, dpi: 1 },
  particleArea: {},
});

// Determine stroke color based on theme or prop
const currentStrokeColor = computed(() => {
  if (props.strokeColor) return props.strokeColor;
  // Check if we are in dark mode
  if (typeof window !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return "#a855f7"; // Purple for dark mode (matches primary color)
  }
  return "#a3a3a3"; // Lighter gray for light mode
});

// Watch for theme changes to update canvas
if (typeof window !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        // Re-render lines with new color
        setLines();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
}

function linear(p) {
  return p;
}

function easeInExpo(p) {
  return p === 0 ? 0 : Math.pow(2, 10 * (p - 1));
}

function tweenValue(start, end, p, ease = null) {
  const delta = end - start;
  const easeFn = ease === "inExpo" ? easeInExpo : linear;
  return start + delta * easeFn(p);
}

function tweenDisc(disc) {
  const { startDisc, endDisc } = stateRef.value;
  disc.x = tweenValue(startDisc.x, endDisc.x, disc.p);
  disc.y = tweenValue(startDisc.y, endDisc.y, disc.p, "inExpo");
  disc.w = tweenValue(startDisc.w, endDisc.w, disc.p);
  disc.h = tweenValue(startDisc.h, endDisc.h, disc.p);
}

function setSize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  stateRef.value.rect = { width: rect.width, height: rect.height };
  stateRef.value.render = {
    width: rect.width,
    height: rect.height,
    dpi: window.devicePixelRatio || 1,
  };
  canvas.width = stateRef.value.render.width * stateRef.value.render.dpi;
  canvas.height = stateRef.value.render.height * stateRef.value.render.dpi;
}

function setDiscs() {
  const { width, height } = stateRef.value.rect;
  if (width <= 0 || height <= 0) return;

  stateRef.value.discs = [];
  stateRef.value.startDisc = {
    p: 0,
    x: width * 0.5,
    y: height * 0.45,
    w: width * 0.75,
    h: height * 0.7,
  };
  stateRef.value.endDisc = {
    p: 0,
    x: width * 0.5,
    y: height * 0.95,
    w: 0,
    h: 0,
  };

  let prevBottom = height;
  stateRef.value.clip = {};

  for (let i = 0; i < props.numberOfDiscs; i++) {
    const p = i / props.numberOfDiscs;
    const disc = { p, x: 0, y: 0, w: 0, h: 0 };
    tweenDisc(disc);
    const bottom = disc.y + disc.h;
    if (bottom <= prevBottom) {
      stateRef.value.clip = { disc: { ...disc }, i };
    }
    prevBottom = bottom;
    stateRef.value.discs.push(disc);
  }

  if (stateRef.value.clip.disc) {
    const clipPath = new Path2D();
    const disc = stateRef.value.clip.disc;
    clipPath.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
    clipPath.rect(disc.x - disc.w, 0, disc.w * 2, disc.y);
    stateRef.value.clip.path = clipPath;
  }
}

function setLines() {
  const { width, height } = stateRef.value.rect;
  // Ensure we have valid dimensions
  if (width <= 0 || height <= 0) return;

  stateRef.value.lines = [];
  const linesAngle = (Math.PI * 2) / props.numberOfLines;
  for (let i = 0; i < props.numberOfLines; i++) {
    stateRef.value.lines.push([]);
  }

  stateRef.value.discs.forEach((disc) => {
    for (let i = 0; i < props.numberOfLines; i++) {
      const angle = i * linesAngle;
      const p = {
        x: disc.x + Math.cos(angle) * disc.w,
        y: disc.y + Math.sin(angle) * disc.h,
      };
      stateRef.value.lines[i].push(p);
    }
  });

  const offCanvas = document.createElement("canvas");
  // Ensure we set dimensions before getting context
  offCanvas.width = Math.max(1, width); // Ensure at least 1px
  offCanvas.height = Math.max(1, height); // Ensure at least 1px

  const ctx = offCanvas.getContext("2d");
  if (!ctx || !stateRef.value.clip.path) {
    stateRef.value.linesCanvas = undefined;
    return;
  }

  // Clear the canvas first
  ctx.clearRect(0, 0, offCanvas.width, offCanvas.height);

  stateRef.value.lines.forEach((line) => {
    ctx.save();
    let lineIsIn = false;
    line.forEach((p1, j) => {
      if (j === 0) return;
      const p0 = line[j - 1];
      if (
        !lineIsIn &&
        (ctx.isPointInPath(stateRef.value.clip.path, p1.x, p1.y) ||
          ctx.isPointInStroke(stateRef.value.clip.path, p1.x, p1.y))
      ) {
        lineIsIn = true;
      } else if (lineIsIn) {
        ctx.clip(stateRef.value.clip.path);
      }
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = currentStrokeColor.value;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.closePath();
    });
    ctx.restore();
  });
  stateRef.value.linesCanvas = offCanvas;
}

function initParticle(start = false) {
  const sx =
    (stateRef.value.particleArea.sx || 0) +
    (stateRef.value.particleArea.sw || 0) * Math.random();
  const ex =
    (stateRef.value.particleArea.ex || 0) +
    (stateRef.value.particleArea.ew || 0) * Math.random();
  const dx = ex - sx;
  const y = start
    ? (stateRef.value.particleArea.h || 0) * Math.random()
    : stateRef.value.particleArea.h || 0;
  const r = 0.5 + Math.random() * 4;
  const vy = 0.5 + Math.random();
  return {
    x: sx,
    sx,
    dx,
    y,
    vy,
    p: 0,
    r,
    c: `rgba(${props.particleRGBColor[0]}, ${props.particleRGBColor[1]}, ${props.particleRGBColor[2]}, ${Math.random()})`,
  };
}

function setParticles() {
  const { width, height } = stateRef.value.rect;
  stateRef.value.particles = [];
  const disc = stateRef.value.clip.disc;
  if (!disc) return;
  stateRef.value.particleArea = {
    sw: disc.w * 0.5,
    ew: disc.w * 2,
    h: height * 0.85,
  };
  stateRef.value.particleArea.sx =
    (width - (stateRef.value.particleArea.sw || 0)) / 2;
  stateRef.value.particleArea.ex =
    (width - (stateRef.value.particleArea.ew || 0)) / 2;
  const totalParticles = 100;
  for (let i = 0; i < totalParticles; i++) {
    stateRef.value.particles.push(initParticle(true));
  }
}

function drawDiscs(ctx) {
  ctx.strokeStyle = currentStrokeColor.value;
  ctx.lineWidth = 2;
  const outerDisc = stateRef.value.startDisc;
  ctx.beginPath();
  ctx.ellipse(
    outerDisc.x,
    outerDisc.y,
    outerDisc.w,
    outerDisc.h,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.closePath();
  stateRef.value.discs.forEach((disc, i) => {
    if (i % 5 !== 0) return;
    if (disc.w < (stateRef.value.clip.disc?.w || 0) - 5) {
      ctx.save();
      ctx.clip(stateRef.value.clip.path);
    }
    ctx.beginPath();
    ctx.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.closePath();
    if (disc.w < (stateRef.value.clip.disc?.w || 0) - 5) {
      ctx.restore();
    }
  });
}

function drawLines(ctx) {
  if (
    stateRef.value.linesCanvas &&
    stateRef.value.linesCanvas.width > 0 &&
    stateRef.value.linesCanvas.height > 0
  ) {
    ctx.drawImage(stateRef.value.linesCanvas, 0, 0);
  }
}

function drawParticles(ctx) {
  ctx.save();
  ctx.clip(stateRef.value.clip.path);
  stateRef.value.particles.forEach((particle) => {
    ctx.fillStyle = particle.c;
    ctx.beginPath();
    ctx.rect(particle.x, particle.y, particle.r, particle.r);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function moveDiscs() {
  stateRef.value.discs.forEach((disc) => {
    disc.p = (disc.p + 0.001) % 1;
    tweenDisc(disc);
  });
}

function moveParticles() {
  stateRef.value.particles.forEach((particle, idx) => {
    particle.p = 1 - particle.y / (stateRef.value.particleArea.h || 1);
    particle.x = particle.sx + particle.dx * particle.p;
    particle.y -= particle.vy;
    if (particle.y < 0) {
      stateRef.value.particles[idx] = initParticle();
    }
  });
}

function tick() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(stateRef.value.render.dpi, stateRef.value.render.dpi);
  moveDiscs();
  moveParticles();
  drawDiscs(ctx);
  drawLines(ctx);
  drawParticles(ctx);
  ctx.restore();
  animationFrameIdRef.value = requestAnimationFrame(tick);
}

function init() {
  setSize();
  setDiscs();
  setLines();
  setParticles();
}

function handleResize() {
  setSize();
  setDiscs();
  setLines();
  setParticles();
}

onMounted(() => {
  nextTick(() => {
    setSize();
    init();
    tick();
    window.addEventListener("resize", handleResize);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  cancelAnimationFrame(animationFrameIdRef.value);
});
</script>
