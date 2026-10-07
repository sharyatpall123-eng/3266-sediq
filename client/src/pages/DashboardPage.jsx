import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiBox,
  FiPackage,
  FiRefreshCw,
} from "react-icons/fi";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { dashboardService } from "../Services/wmsService";
import { formatNumber } from "../utils/format";

const fallbackSummary = {
  totalWarehouses: 0,
  stockIn: 0,
  stockOut: 0,
  netBalance: 0,
  lowStock: 0,
};

const companyPalette = [
  { color: "#84cc16", dotClass: "bg-lime-500" },
  { color: "#06b6d4", dotClass: "bg-cyan-500" },
  { color: "#f43f5e", dotClass: "bg-rose-500" },
  { color: "#a78bfa", dotClass: "bg-violet-400" },
  { color: "#f59e0b", dotClass: "bg-amber-500" },
  { color: "#3b82f6", dotClass: "bg-blue-500" },
];



const sliderImages = [
  "/backgrounds/stock-2.jpg",
  "/backgrounds/stock-3.jpg",
  "/backgrounds/stock-4.jpg",
  "/backgrounds/stock-5.jpg",
  "/backgrounds/stock-6.jpg",
  "/backgrounds/stock-8.jpg",
  "/backgrounds/stock-9.jpg",
  "/backgrounds/stock-10.jpg",
  "/backgrounds/stock-11.jpg",

  // نور عکسونه همدلته اضافه کړه:
  // "/backgrounds/stock-4.jpg",
  // "/backgrounds/stock-5.jpg",
  // "/backgrounds/stock-6.jpg",
];

const DEFAULT_SLIDE_SECONDS = 10;
const SLIDE_SECONDS_STORAGE_KEY = "wms_dashboard_slide_seconds";

function getSlideSeconds() {
  if (typeof window === "undefined") return DEFAULT_SLIDE_SECONDS;
  const saved = Number(localStorage.getItem(SLIDE_SECONDS_STORAGE_KEY) || DEFAULT_SLIDE_SECONDS);
  return Number.isFinite(saved) && saved >= 3 ? saved : DEFAULT_SLIDE_SECONDS;
}

function formatRelativeTime(value) {
  if (!value) return "اوس";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "اوس";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day ago`;
}

function activityIconMeta(title = "") {
  const text = String(title).toLowerCase();
  if (text.includes("stock out") || text.includes("خارج")) {
    return { icon: FiArrowUp, iconClass: "bg-emerald-100 text-emerald-600" };
  }
  if (text.includes("stock") || text.includes("invoice") || text.includes("داخل")) {
    return { icon: FiArrowDown, iconClass: "bg-blue-100 text-blue-600" };
  }
  if (text.includes("order")) {
    return { icon: FiPackage, iconClass: "bg-violet-100 text-violet-600" };
  }
  return { icon: FiRefreshCw, iconClass: "bg-orange-100 text-orange-600" };
}

function WelcomeBanner({ displayName }) {
  return (
    <section className="wms-dashboard-hero relative overflow-hidden rounded-[22px] px-4 py-3 shadow-[0_16px_40px_rgba(30,64,175,0.24)] sm:rounded-[24px] sm:px-7 sm:py-4" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')", backgroundRepeat: "no-repeat", backgroundColor: "#164e73" }}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/75 via-blue-950/45 to-slate-950/15" />
      <div className="pointer-events-none absolute -left-12 -top-14 size-36 rounded-full border border-white/15 bg-white/5" />
      <div className="pointer-events-none absolute -bottom-16 right-8 size-44 rounded-full border border-cyan-200/20 bg-cyan-300/10 blur-sm" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

      <div className="relative z-10 flex min-h-[96px] items-center justify-between gap-5 sm:min-h-[118px]">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-black tracking-tight text-white sm:text-3xl">
            Hey {displayName}! 👋
          </h1>
          <p dir="rtl" className="mt-1.5 text-xs font-semibold text-blue-50 sm:mt-2 sm:text-base">
           خوندي، مطمینه او منظمه مدیریتی سیستم
          </p>
        </div>
      </div>
    </section>
  );
}

function AnimatedNumber({ value }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!target) { setShown(0); return undefined; }
    const started = performance.now();
    const duration = 750;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      setShown(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <>{formatNumber(shown)}</>;
}

function SummaryCard({ title, value, icon: Icon, iconClass, index }) {
  return (
    <article
      className={[
        "wms-summary-card wms-dashboard-summary min-h-[72px] items-center gap-2.5 rounded-[18px] border border-white/90 bg-white px-3 py-2.5 sm:min-h-[92px] sm:gap-3 sm:rounded-[22px] sm:px-4 sm:py-3",
        "shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition duration-300 hover:-translate-y-1",
        "hover:shadow-[0_18px_40px_rgba(37,99,235,0.17)]",
        index === 4 ? "hidden sm:flex" : "flex",
      ].join(" ")}
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-[14px] text-lg sm:size-12 sm:rounded-[17px] sm:text-xl ${iconClass}`}>
        <Icon />
      </div>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-[10px] font-extrabold text-slate-600 sm:text-xs">
          {title}
        </p>
        <p className="mt-0.5 text-xl font-black tracking-tight text-slate-950 sm:mt-1 sm:text-2xl">
          <AnimatedNumber value={value} />
        </p>
      </div>
    </article>
  );
}

function WarehouseBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideSeconds, setSlideSeconds] = useState(getSlideSeconds());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncValue = () => setSlideSeconds(getSlideSeconds());
    window.addEventListener("storage", syncValue);
    window.addEventListener("dashboard-slider-seconds-updated", syncValue);

    return () => {
      window.removeEventListener("storage", syncValue);
      window.removeEventListener("dashboard-slider-seconds-updated", syncValue);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % sliderImages.length);
    }, slideSeconds * 1000);

    return () => clearInterval(timer);
  }, [slideSeconds]);

  return (
    <article
      className="wms-dashboard-slider relative min-h-[220px] sm:min-h-[230px] lg:min-h-[240px] overflow-hidden rounded-[26px] shadow-[0_18px_44px_rgba(15,23,42,0.20)]"
      style={{
        backgroundImage: `url('${sliderImages[currentSlide]}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/15" />
      <div className="relative z-10 flex min-h-[220px] flex-col justify-center px-5 sm:min-h-[230px] lg:min-h-[240px] sm:px-7 text-white sm:px-10">
        <h2 className="max-w-md text-2xl font-black leading-tight lg:text-[26px]">Smart Warehouse Management</h2>
        <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/80">Track, manage and grow your business efficiently.</p>
        <div className="mt-2 text-xs font-semibold text-white/70">
          Auto change: every {slideSeconds} seconds
        </div>
        <button type="button" className="mt-3 w-fit rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-950/30">View Details</button>
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {sliderImages.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentSlide(index)}
            className={index === currentSlide ? "h-2 w-7 rounded-full bg-blue-500" : "size-2 rounded-full bg-white/80"}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </article>
  );
}

function getKabulWeatherLabel(code) {
  const value = Number(code);

  if (value === 0) return { icon: "☀️", label: "صافه هوا", effect: "clear" };
  if ([1, 2].includes(value)) return { icon: "🌤️", label: "لږ وريځ", effect: "cloud" };
  if (value === 3) return { icon: "☁️", label: "وريځ", effect: "cloud" };
  if ([45, 48].includes(value)) return { icon: "🌫️", label: "لوګی / مه", effect: "mist" };

  if ([51, 53, 55, 56, 57].includes(value)) {
    return { icon: "🌦️", label: "سپک باران", effect: "rain-light" };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) {
    return { icon: "🌧️", label: "باران", effect: "rain" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(value)) {
    return { icon: "❄️", label: "واوره", effect: "snow" };
  }

  if ([95, 96, 99].includes(value)) {
    return { icon: "⛈️", label: "تندر او باران", effect: "thunder" };
  }

  return { icon: "🌤️", label: "هوا", effect: "clear" };
}

const weatherRainDrops = Array.from({ length: 74 }, (_, index) => ({
  x: 8 + ((index * 47) % 888),
  delay: ((index * 17) % 18) / 10,
  duration: 0.52 + ((index * 11) % 8) / 10,
  length: 20 + ((index * 19) % 34),
  width: index % 7 === 0 ? 2.2 : index % 3 === 0 ? 1.7 : 1.25,
  opacity: 0.34 + ((index * 7) % 42) / 100,
}));

const weatherGlassDrops = Array.from({ length: 22 }, (_, index) => ({
  x: 28 + ((index * 83) % 840),
  y: 26 + ((index * 59) % 215),
  radius: 2.5 + (index % 5),
  opacity: 0.08 + (index % 4) * 0.035,
}));

const weatherSplashes = Array.from({ length: 16 }, (_, index) => ({
  x: 25 + ((index * 71) % 850),
  delay: ((index * 23) % 20) / 10,
  duration: 1.1 + (index % 4) * 0.28,
}));

const weatherSnowFlakes = Array.from({ length: 34 }, (_, index) => ({
  x: 12 + ((index * 53) % 870),
  radius: 2 + (index % 4),
  delay: ((index * 17) % 14) / 10,
  duration: 3.5 + ((index * 11) % 22) / 10,
}));

function WeatherAnimation({ effect }) {
  const isRain = ["rain-light", "rain", "thunder"].includes(effect);
  const isSnow = effect === "snow";
  const isMist = effect === "mist";
  const isThunder = effect === "thunder";

  if (!isRain && !isSnow && !isMist) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      <svg
        viewBox="0 0 900 300"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="weatherRainShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.10" />
            <stop offset="48%" stopColor="#0f172a" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.20" />
          </linearGradient>

          <radialGradient id="glassDropFill">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="48%" stopColor="#dbeafe" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.04" />
          </radialGradient>

          <filter id="rainSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.55" />
          </filter>

          <filter id="glassDropShadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#0f172a" floodOpacity="0.22" />
          </filter>
        </defs>

        {isRain ? (
          <>
            <rect
              x="0"
              y="0"
              width="900"
              height="300"
              fill="url(#weatherRainShade)"
              opacity={effect === "rain-light" ? "0.55" : "0.9"}
            />

            {/* Large glass droplets: they make it feel like rain is on top of the screen. */}
            {weatherGlassDrops.map((drop, index) => (
              <g key={`glass-drop-${index}`} opacity={drop.opacity}>
                <ellipse
                  cx={drop.x}
                  cy={drop.y}
                  rx={drop.radius * 0.82}
                  ry={drop.radius * 1.22}
                  fill="url(#glassDropFill)"
                  stroke="#ffffff"
                  strokeWidth="0.7"
                  filter="url(#glassDropShadow)"
                />
                <ellipse
                  cx={drop.x - drop.radius * 0.2}
                  cy={drop.y - drop.radius * 0.35}
                  rx={Math.max(0.7, drop.radius * 0.19)}
                  ry={Math.max(0.9, drop.radius * 0.28)}
                  fill="#ffffff"
                  opacity="0.45"
                />
              </g>
            ))}

            {/* Falling drops */}
            {weatherRainDrops.map((drop, index) => (
              <line
                key={`rain-${index}`}
                x1={drop.x}
                y1={-drop.length}
                x2={drop.x - 8}
                y2="0"
                stroke="#eff6ff"
                strokeWidth={drop.width}
                strokeLinecap="round"
                opacity={effect === "rain-light" ? drop.opacity * 0.72 : drop.opacity}
                filter={index % 5 === 0 ? "url(#rainSoftGlow)" : undefined}
              >
                <animate
                  attributeName="y1"
                  values={`${-drop.length};${330 - drop.length}`}
                  dur={`${drop.duration}s`}
                  begin={`${drop.delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y2"
                  values={`0;330`}
                  dur={`${drop.duration}s`}
                  begin={`${drop.delay}s`}
                  repeatCount="indefinite"
                />
              </line>
            ))}

            {/* Bottom splashes */}
            {weatherSplashes.map((splash, index) => (
              <ellipse
                key={`splash-${index}`}
                cx={splash.x}
                cy="292"
                rx="2"
                ry="0.7"
                fill="none"
                stroke="#e0f2fe"
                strokeWidth="1.2"
                opacity="0"
              >
                <animate
                  attributeName="rx"
                  values="2;11;18"
                  dur={`${splash.duration}s`}
                  begin={`${splash.delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="ry"
                  values="0.7;2.5;4"
                  dur={`${splash.duration}s`}
                  begin={`${splash.delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.42;0"
                  dur={`${splash.duration}s`}
                  begin={`${splash.delay}s`}
                  repeatCount="indefinite"
                />
              </ellipse>
            ))}

            {/* Soft wet-glass line at bottom */}
            <rect
              x="0"
              y="262"
              width="900"
              height="38"
              fill="#dbeafe"
              opacity="0.035"
            />

            {isThunder ? (
              <rect x="0" y="0" width="900" height="300" fill="#ffffff" opacity="0">
                <animate
                  attributeName="opacity"
                  values="0;0;0.70;0;0;0.22;0;0"
                  dur="5.4s"
                  repeatCount="indefinite"
                />
              </rect>
            ) : null}
          </>
        ) : null}

        {isSnow ? (
          <>
            <rect x="0" y="0" width="900" height="300" fill="#e0f2fe" opacity="0.08" />

            {weatherSnowFlakes.map((flake, index) => (
              <circle
                key={`snow-${index}`}
                cx={flake.x}
                cy="-12"
                r={flake.radius}
                fill="#ffffff"
                opacity={0.72 + (index % 3) * 0.08}
              >
                <animate
                  attributeName="cy"
                  values="-12;320"
                  dur={`${flake.duration}s`}
                  begin={`${flake.delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cx"
                  values={`${flake.x};${flake.x + 22};${flake.x - 14};${flake.x}`}
                  dur={`${flake.duration * 1.3}s`}
                  begin={`${flake.delay}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </>
        ) : null}

        {isMist ? (
          <>
            {[40, 95, 150, 205, 260].map((y, index) => (
              <rect
                key={`mist-${y}`}
                x="-260"
                y={y}
                width="420"
                height="30"
                rx="15"
                fill="#ffffff"
                opacity={0.12 + index * 0.025}
              >
                <animate
                  attributeName="x"
                  values="-260;900"
                  dur={`${12 + index * 2}s`}
                  begin={`${index * -2}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ))}
          </>
        ) : null}
      </svg>
    </div>
  );
}

function weatherTheme(effect, isDay = true) {
  if (effect === "thunder") {
    return "bg-[radial-gradient(circle_at_72%_18%,rgba(255,255,255,0.18),transparent_20%),linear-gradient(145deg,#111827_0%,#334155_45%,#0f172a_100%)]";
  }

  if (effect === "rain" || effect === "rain-light") {
    return "bg-[radial-gradient(circle_at_72%_18%,rgba(255,255,255,0.18),transparent_22%),linear-gradient(145deg,#718096_0%,#5b7086_42%,#3f5268_100%)]";
  }

  if (effect === "snow") {
    return "bg-[radial-gradient(circle_at_75%_15%,rgba(255,255,255,0.55),transparent_20%),linear-gradient(145deg,#94a3b8_0%,#cbd5e1_50%,#64748b_100%)]";
  }

  if (effect === "mist" || effect === "cloud") {
    return "bg-[radial-gradient(circle_at_75%_16%,rgba(255,255,255,0.22),transparent_23%),linear-gradient(145deg,#64748b_0%,#94a3b8_50%,#475569_100%)]";
  }

  if (!isDay) {
    return "bg-[radial-gradient(circle_at_76%_15%,rgba(191,219,254,0.18),transparent_18%),linear-gradient(145deg,#020617_0%,#172554_50%,#0f172a_100%)]";
  }

  return "bg-[radial-gradient(circle_at_76%_15%,rgba(255,255,255,0.35),transparent_18%),linear-gradient(145deg,#0284c7_0%,#2563eb_50%,#0ea5e9_100%)]";
}

function formatWeatherHour(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: "Asia/Kabul",
  }).format(date);
}

function KabulWeatherPanel() {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    let active = true;

    const loadWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=34.5553&longitude=69.2075&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=Asia%2FKabul&forecast_days=2",
        );

        if (!response.ok) throw new Error("Weather request failed");

        const data = await response.json();
        if (!active) return;

        const currentTime = data?.current?.time || "";
        const hourlyTimes = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
        const currentIndex = Math.max(
          0,
          hourlyTimes.findIndex((time) => time >= currentTime),
        );

        const hourly = hourlyTimes
          .slice(currentIndex, currentIndex + 6)
          .map((time, offset) => {
            const index = currentIndex + offset;
            return {
              time,
              temperature: Number(data?.hourly?.temperature_2m?.[index] ?? 0),
              weatherCode: Number(data?.hourly?.weather_code?.[index] ?? 0),
              rainChance: Number(
                data?.hourly?.precipitation_probability?.[index] ?? 0,
              ),
            };
          });

        setWeather({
          temperature: Number(data?.current?.temperature_2m ?? 0),
          apparent: Number(data?.current?.apparent_temperature ?? 0),
          humidity: Number(data?.current?.relative_humidity_2m ?? 0),
          weatherCode: Number(data?.current?.weather_code ?? 0),
          wind: Number(data?.current?.wind_speed_10m ?? 0),
          gusts: Number(data?.current?.wind_gusts_10m ?? 0),
          isDay: Number(data?.current?.is_day ?? 1) === 1,
          time: currentTime,
          high: Number(data?.daily?.temperature_2m_max?.[0] ?? 0),
          low: Number(data?.daily?.temperature_2m_min?.[0] ?? 0),
          rainChance: Number(
            data?.daily?.precipitation_probability_max?.[0] ?? 0,
          ),
          sunrise: data?.daily?.sunrise?.[0] || "",
          sunset: data?.daily?.sunset?.[0] || "",
          hourly,
        });

        setWeatherError(false);
      } catch {
        if (!active) return;
        setWeatherError(true);
      }
    };

    loadWeather();

    const timer = window.setInterval(loadWeather, 10 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const weatherMeta = getKabulWeatherLabel(weather?.weatherCode);
  const themeClass = weatherTheme(weatherMeta.effect, weather?.isDay ?? true);

  return (
    <article
      dir="rtl"
      className={`wms-dashboard-weather relative min-h-[220px] sm:min-h-[230px] lg:min-h-[240px] overflow-hidden rounded-[26px] border border-white/25 text-white shadow-[0_18px_44px_rgba(15,23,42,0.22)] ${themeClass}`}
    >
      <WeatherAnimation effect={weatherMeta.effect} />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-slate-950/18" />

      {weatherMeta.effect === "clear" && weather?.isDay ? (
        <div className="pointer-events-none absolute right-10 top-8 size-24 rounded-full bg-amber-200/80 shadow-[0_0_70px_rgba(253,224,71,0.45)] blur-[1px]" />
      ) : null}

      <div className="relative z-10 flex min-h-[220px] flex-col p-3 sm:min-h-[230px] sm:p-4 lg:min-h-[240px]">
        {!weather && !weatherError ? (
          <div className="flex min-h-[190px] items-center justify-center">
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black backdrop-blur-md">
              د کابل هوا لوډېږي...
            </div>
          </div>
        ) : weatherError && !weather ? (
          <div className="flex min-h-[190px] items-center justify-center">
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-center backdrop-blur-md">
              <p className="text-sm font-black">د هوا معلومات ترلاسه نه شول</p>
              <p className="mt-1 text-[10px] font-semibold text-white/70">
                Internet connection وګوره
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="text-right">
                <p className="text-2xl font-medium tracking-tight sm:text-3xl">
                  کابل
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-white/65">
                  ژوندۍ هوا · هر ۱۰ دقیقې تازه کېږي
                </p>
              </div>

              <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-left backdrop-blur-md">
                <p className="text-[9px] font-bold text-white/65">Live</p>
                <p className="mt-0.5 text-xs font-black">
                  {weatherMeta.label}
                </p>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-center gap-3 text-center">
              <span className="text-4xl drop-shadow sm:text-5xl">
                {weatherMeta.icon}
              </span>

              <div>
                <p className="text-6xl font-extralight leading-none tracking-[-0.07em] sm:text-7xl">
                  {Math.round(weather.temperature)}°
                </p>
                <p className="mt-1 text-sm font-bold text-white/95">
                  {weatherMeta.label}
                </p>
                <p className="mt-0.5 text-xs font-bold text-white/75">
                  H:{Math.round(weather.high)}° &nbsp; L:{Math.round(weather.low)}°
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2 text-center backdrop-blur-md">
                <p className="text-[9px] font-bold text-white/60">Feels</p>
                <p className="mt-0.5 text-xs font-black">
                  {Math.round(weather.apparent)}°
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2 text-center backdrop-blur-md">
                <p className="text-[9px] font-bold text-white/60">Humidity</p>
                <p className="mt-0.5 text-xs font-black">
                  {Math.round(weather.humidity)}%
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2 text-center backdrop-blur-md">
                <p className="text-[9px] font-bold text-white/60">Wind</p>
                <p className="mt-0.5 text-xs font-black">
                  {Math.round(weather.wind)} km/h
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2 text-center backdrop-blur-md">
                <p className="text-[9px] font-bold text-white/60">Rain</p>
                <p className="mt-0.5 text-xs font-black">
                  {Math.round(weather.rainChance)}%
                </p>
              </div>
            </div>

            <div className="mt-2 overflow-hidden rounded-[18px] border border-white/15 bg-slate-950/15 px-2 py-2 backdrop-blur-md">
              <div className="grid grid-cols-6 gap-1">
                {weather.hourly.map((item, index) => {
                  const meta = getKabulWeatherLabel(item.weatherCode);

                  return (
                    <div
                      key={`${item.time}-${index}`}
                      className="min-w-0 text-center"
                    >
                      <p className="truncate text-[8px] font-black text-white/70 sm:text-[9px]">
                        {index === 0 ? "اوس" : formatWeatherHour(item.time)}
                      </p>
                      <p className="my-0.5 text-base sm:text-lg">{meta.icon}</p>
                      <p className="text-[8px] font-black text-cyan-200 sm:text-[9px]">
                        {Math.round(item.rainChance)}%
                      </p>
                      <p className="mt-0.5 text-[10px] font-black sm:text-xs">
                        {Math.round(item.temperature)}°
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function StockDistribution({ companies }) {
  const total = companies.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <article className="wms-dashboard-chart min-w-0 rounded-[26px] border border-white/90 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.11)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-950 sm:text-base">Company Stock Distribution</h2>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">له هر شرکت سره لا څو کارټنه مال پاتې دی</p>
        </div>
        <button type="button" className="text-xl font-black text-slate-500">···</button>
      </div>
      <div className="relative mt-2 h-56 sm:h-60">
        {companies.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={companies} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={1} stroke="#ffffff" strokeWidth={3}>
                  {companies.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value) => [`${value} cartons`, "Cartons"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xs font-bold text-slate-400">Total Remaining</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(total)}</p>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs font-bold text-slate-400">
            No representative stock data yet
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2 sm:text-xs">
        {companies.map((item) => (
          <div key={item.name} className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-100 px-3 py-2">
            <span className={`size-2.5 shrink-0 rounded-full ${item.dotClass}`} />
            <span className="truncate font-bold text-slate-600">{item.name}</span>
            <span className="ml-auto shrink-0 font-black text-slate-950">{formatNumber(item.value)} ctn</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function ProgressTrack({ value, colorClass, direction = "left" }) {
  return (
    <div
      className={[
        "flex h-2.5 overflow-hidden rounded-full bg-slate-100",
        direction === "right" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function LoanComparison({ data = [] }) {
  const formatPercent = (value) => {
    const numeric = Number(value || 0);
    return `${Number(numeric.toFixed(1))}%`;
  };

  return (
    <article className="wms-dashboard-chart min-w-0 rounded-[26px] border border-white/90 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.11)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-950 sm:text-base">
          Debtors (Credit Given vs Received)
        </h2>
        <button type="button" className="text-xl font-black text-slate-500">···</button>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="min-w-[650px]">
          <div className="grid grid-cols-[52px_1fr_66px_1fr_52px] items-center gap-x-3">
            <p className="col-span-2 text-center text-[11px] font-black text-emerald-600">
             د وصولیو ګراف
            </p>
            <div />
            <p className="col-span-2 text-center text-[11px] font-black text-blue-700">
              د باقیاتو ګراف
            </p>

            {data.length === 0 ? (
              <div className="col-span-5 py-12 text-center text-xs font-bold text-slate-400">
                No credit activity yet
              </div>
            ) : (
              data.map((item) => {
                const given = Math.max(0, Number(item.given || 0));
                const received = Math.max(0, Number(item.received || 0));

                let givenPercent = 0;
                let receivedPercent = 0;

                if (given > 0) {
                  givenPercent = 100;
                  receivedPercent = Math.min(100, (received / given) * 100);
                } else if (received > 0) {
                  receivedPercent = 100;
                }

                return (
                  <div key={item.monthKey || item.month} className="contents">
                    <p className="flex h-8 items-center justify-end text-[11px] font-black text-emerald-600">
                      {formatPercent(receivedPercent)}
                    </p>

                    <ProgressTrack
                      value={receivedPercent}
                      colorClass="bg-emerald-500"
                      direction="right"
                    />

                    <div className="flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-1 text-[10px] font-black text-slate-800 shadow-sm">
                      {item.month}
                    </div>

                    <ProgressTrack
                      value={givenPercent}
                      colorClass="bg-blue-600"
                    />

                    <p className="flex h-8 items-center text-[11px] font-black text-blue-700">
                      {formatPercent(givenPercent)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function RecentActivities({ activities }) {
  const visibleActivities = activities.slice(0, 6);

  return (
    <article className="wms-dashboard-recent rounded-[22px] border border-white/90 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.10)] sm:rounded-[26px] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-slate-950 sm:text-base">Recent Activities</h2>
          <p className="mt-0.5 hidden text-[11px] font-semibold text-slate-400 sm:block">Real activities from your current data</p>
        </div>
        <button type="button" className="shrink-0 rounded-lg border border-blue-200 px-2.5 py-1.5 text-[9px] font-black text-blue-600 sm:rounded-xl sm:px-4 sm:py-2 sm:text-[11px]">View All</button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
        {visibleActivities.map((activity) => {
          const Icon = activity.icon;
          return (
            <div
              key={activity.id}
              className="min-w-0 rounded-[16px] border border-slate-100 bg-slate-50/75 p-2 text-center md:flex md:items-center md:gap-3 md:bg-transparent md:text-left xl:border-r xl:last:border-r-0"
            >
              <div className={`mx-auto flex size-8 shrink-0 items-center justify-center rounded-xl text-sm md:mx-0 md:size-11 md:rounded-2xl md:text-lg ${activity.iconClass}`}><Icon /></div>
              <div className="mt-1.5 min-w-0 flex-1 md:mt-0">
                <p className="truncate text-[9px] font-black text-slate-900 md:text-xs">{activity.title}</p>
                <p className="mt-0.5 truncate text-[8px] font-semibold text-slate-400 md:mt-1 md:text-[11px]">{activity.subtitle}</p>
                <p className="mt-0.5 truncate text-[8px] font-semibold text-slate-400 md:mt-1 md:text-[10px]">{activity.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DashboardFooter() {
  return (
    <footer className="relative isolate min-h-[64px] overflow-hidden border border-blue-900/50 bg-gradient-to-r from-[#020b22] via-[#06163b] to-[#020b22] shadow-[0_14px_34px_rgba(2,8,23,.26)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,.12),transparent_52%)]" />

      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[36%] overflow-hidden opacity-25 md:block">
        <div className="absolute -left-3 top-1 font-mono text-[8px] leading-[11px] tracking-[0.18em] text-cyan-300/70">
          <p>00101100 01001001 11000101 00101010</p>
          <p>function system() &#123; return secureWarehouse; &#125;</p>
          <p>10100110 00110101 11001100 01010011</p>
          <p>const data = inventory.map(item =&gt; item.stock);</p>
          <p>01110001 10101010 00110110 11001001</p>
        </div>
      </div>

      <svg viewBox="0 0 520 90" aria-hidden="true" className="pointer-events-none absolute right-0 top-0 hidden h-full w-[36%] opacity-35 md:block">
        <g fill="none" stroke="currentColor" strokeWidth="1.3" className="text-blue-400">
          <path d="M20 24H130L154 10H250L270 24H355L375 10H470" />
          <path d="M82 45H180L198 30H290L306 45H415" />
          <path d="M8 66H112L132 52H235L253 66H342L360 52H505" />
          <path d="M170 79H280L300 64H400L420 79H500" />
        </g>

        <g className="fill-cyan-400">
          <circle cx="20" cy="24" r="3" />
          <circle cx="130" cy="24" r="3" />
          <circle cx="250" cy="10" r="3" />
          <circle cx="355" cy="24" r="3" />
          <circle cx="470" cy="10" r="3" />
          <circle cx="82" cy="45" r="3" />
          <circle cx="290" cy="30" r="3" />
          <circle cx="415" cy="45" r="3" />
          <circle cx="112" cy="66" r="3" />
          <circle cx="342" cy="66" r="3" />
          <circle cx="505" cy="52" r="3" />
        </g>
      </svg>

      <div className="relative z-10 flex min-h-[64px] flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-3 text-center text-[10px] font-semibold text-slate-200 sm:text-[11px] lg:gap-x-7">
        <span className="whitespace-nowrap">Software Engineering Developer</span>
        <span className="hidden h-5 w-px bg-slate-200/70 sm:block" />
        <span className="whitespace-nowrap font-black text-white">Aziz ullah Niazi</span>
        <span className="hidden h-5 w-px bg-slate-200/70 sm:block" />
        <span className="whitespace-nowrap">© 2026 All rights reserved</span>
      </div>
    </footer>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const tr = (en, ps, fa = ps) => settings.language === "en" ? en : settings.language === "fa" ? fa : ps;
  const [summary, setSummary] = useState(fallbackSummary);
  const [activities, setActivities] = useState([]);
  const [companyDistribution, setCompanyDistribution] = useState([]);
  const [creditComparison, setCreditComparison] = useState([]);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        const dashboard = await dashboardService.get();
        if (!active) return;

        setSummary({
          ...fallbackSummary,
          ...(dashboard?.summary || {}),
        });

        const chartRows = (Array.isArray(dashboard?.companyDistribution)
          ? dashboard.companyDistribution
          : []
        ).map((company, index) => ({
          ...company,
          color: companyPalette[index % companyPalette.length].color,
          dotClass: companyPalette[index % companyPalette.length].dotClass,
        }));

        setCompanyDistribution(chartRows);
        setCreditComparison(
          Array.isArray(dashboard?.creditComparison)
            ? dashboard.creditComparison
            : [],
        );

        const liveActivities = (
          Array.isArray(dashboard?.recentMovements)
            ? dashboard.recentMovements
            : []
        ).map((item, index) => {
          const type = String(item.type || item.movement_type || "").toLowerCase();
          const title =
            type === "out"
              ? "Stock Out"
              : type === "in"
                ? "Stock In"
                : "Stock Movement";
          const meta = activityIconMeta(title);

          return {
            id: item.id || `movement-${index}`,
            title,
            subtitle: `${item.product_name || "Product"} • ${Number(item.quantity || 0)} ${item.unit || ""}`.trim(),
            time: formatRelativeTime(item.created_at || item.date),
            icon: meta.icon,
            iconClass: meta.iconClass,
          };
        });

        setActivities(
          liveActivities.length
            ? liveActivities
            : [{
                id: "no-activity",
                title: "No recent activity",
                subtitle: "Stock activity will appear here",
                time: "Now",
                ...activityIconMeta("stock"),
              }],
        );
      } catch {
        if (!active) return;
        setSummary(fallbackSummary);
        setCompanyDistribution([]);
        setCreditComparison([]);
        setActivities([{
          id: "no-activity",
          title: "No recent activity",
          subtitle: "Stock activity will appear here",
          time: "Now",
          ...activityIconMeta("stock"),
        }]);
      }
    };

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const displayName = useMemo(
    () => profile?.full_name || profile?.username || "Administrator",
    [profile],
  );

  const cards = [
    { title: tr("Total Warehouses", "ټول ګدامونه", "تمام گدام ها"), value: summary.totalWarehouses, icon: FiBox, iconClass: "bg-blue-100 text-blue-600" },
    { title: tr("Stock In", "داخل شوی مال", "مال وارد شده"), value: summary.stockIn, icon: FiArrowDown, iconClass: "bg-emerald-100 text-emerald-600" },
    { title: tr("Stock Out", "خارج شوی مال", "مال خارج شده"), value: summary.stockOut, icon: FiArrowUp, iconClass: "bg-orange-100 text-orange-600" },
    { title: tr("Net Balance", "ټول موجود مال", "موجودی کل"), value: summary.netBalance, icon: FiPackage, iconClass: "bg-violet-100 text-violet-600" },
    { title: tr("Low Alert", "کم سټاک خبرتیا", "هشدار کمبود موجودی"), value: summary.lowStock, icon: FiAlertTriangle, iconClass: "bg-amber-100 text-amber-600" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-5">
      <div dir="ltr" className="space-y-4">
        <WelcomeBanner displayName={displayName} />

        <section className="wms-dashboard-summary-grid grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((card, index) => (
            <SummaryCard key={card.title} {...card} index={index} />
          ))}
        </section>

        <section className="wms-dashboard-feature-grid grid gap-4 lg:grid-cols-[1.02fr_1.28fr]">
          <WarehouseBanner />
          <KabulWeatherPanel />
        </section>

        <section className="wms-dashboard-analysis-grid grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
          <StockDistribution companies={companyDistribution} />
          <LoanComparison data={creditComparison} />
        </section>

        <RecentActivities activities={activities} />
        <DashboardFooter />
      </div>
    </div>
  );
}
