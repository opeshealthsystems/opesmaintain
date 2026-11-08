import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";

type IconComponent = React.ComponentType<LucideProps>;

/** Renders a Lucide icon by name (industry-standard outline icon set). */
export function Icon({ name, size = 18, ...rest }: { name: string } & LucideProps) {
  const C = ((Lucide as unknown as Record<string, IconComponent>)[name] ?? Lucide.Circle) as IconComponent;
  return <C size={size} strokeWidth={1.75} aria-hidden="true" {...rest} />;
}
