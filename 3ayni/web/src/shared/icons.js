// Only the icons the app uses are imported, so the bundle stays small.
import {
  Activity, ArrowLeft, ChevronLeft, ChevronRight, Delete, Keyboard, MessageCircle, Space, Volume2, Bath, BatteryLow, Bed, BellRing, Check, CircleQuestionMark, CloudLightning, CupSoda,
  Eye, EyeOff, GlassWater, Hand, HandHeart, Heart, HeartPulse, Hourglass, House, Lamp, LayoutGrid, Moon, Phone,
  Repeat, ScanEye, SlidersHorizontal, Snowflake, Stethoscope, Sun, Timer, TriangleAlert, Users, Utensils, Wind,
  Wifi, WifiOff, X, Zap, createElement,
} from 'lucide';

const ICONS = {
  activity: Activity, 'arrow-left': ArrowLeft, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  delete: Delete, keyboard: Keyboard, 'message-circle': MessageCircle, space: Space, 'volume-2': Volume2, bath: Bath, 'battery-low': BatteryLow, bed: Bed,
  'bell-ring': BellRing, check: Check, 'circle-question-mark': CircleQuestionMark, 'cloud-lightning': CloudLightning,
  'cup-soda': CupSoda, eye: Eye, 'eye-off': EyeOff, 'glass-water': GlassWater, hand: Hand, 'hand-heart': HandHeart,
  heart: Heart, 'heart-pulse': HeartPulse, hourglass: Hourglass, house: House, lamp: Lamp, 'layout-grid': LayoutGrid,
  moon: Moon, phone: Phone, repeat: Repeat, 'scan-eye': ScanEye, 'sliders-horizontal': SlidersHorizontal,
  snowflake: Snowflake, stethoscope: Stethoscope, sun: Sun, timer: Timer, 'triangle-alert': TriangleAlert,
  users: Users, utensils: Utensils, wind: Wind, wifi: Wifi, 'wifi-off': WifiOff, x: X, zap: Zap,
};

/**
 * @param {string} name kebab-case lucide icon name
 * @param {number} [size]
 * @returns {SVGElement}
 */
export function icon(name, size = 24) {
  const node = ICONS[name];
  if (!node) throw new Error(`Unknown icon: ${name}`);
  return createElement(node, { width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true' });
}
