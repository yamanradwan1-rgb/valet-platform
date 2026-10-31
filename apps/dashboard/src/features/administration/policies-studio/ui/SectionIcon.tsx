import {
  Bell,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  CreditCard,
  MapPinned,
  MessageCircle,
  Route,
  type LucideIcon,
} from "lucide-react";
import type { Section } from "./catalog";

const icons: Record<Section, LucideIcon> = {
  operations: CarFront,
  payments: CreditCard,
  hours: CalendarClock,
  tracking: Route,
  notifications: Bell,
  presence: ClipboardCheck,
  zones: MapPinned,
  whatsapp: MessageCircle,
};

export function SectionIcon({ section }: { section: Section }) {
  const Icon = icons[section];
  return (
    <Icon
      className="ps-section-icon"
      data-section-icon={section}
      size={18}
      strokeWidth={1.9}
      aria-hidden="true"
      focusable="false"
    />
  );
}
