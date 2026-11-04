/** The AP monogram (owner's logo) as plain SVG elements, for generated images (icons, share image). */
export function BrandMark({ size, fill = "#F4F2EE", accent = "#FF5A1F", stroke = 13 }: { size: number; fill?: string; accent?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,175 120,20 120,175" fill={fill} />
      <path d="M120 20 H145 A50 50 0 0 1 145 120 H120 Z M120 46 H145 A24 24 0 0 1 145 94 H120 Z" fill={fill} fillRule="evenodd" />
      <polyline points="52,162 82,124 112,162" fill="none" stroke={accent} strokeWidth={stroke} strokeLinejoin="miter" />
    </svg>
  );
}
