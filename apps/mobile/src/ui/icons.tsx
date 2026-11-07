import Svg, { Circle, Path, Rect } from "react-native-svg";

interface IconProps {
  color: string;
  size?: number;
}

const stroke = { strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

export function IconToday({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={17} rx={2} stroke={color} {...stroke} />
      <Path d="M16 2v4M8 2v4M3 10h18" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconReview({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 12h-6l-2 3h-4l-2-3H2" stroke={color} {...stroke} />
      <Path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconLibrary({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" stroke={color} {...stroke} />
      <Path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconSearch({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} {...stroke} />
      <Path d="m20 20-3.5-3.5" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconFile({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconShare({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3} stroke={color} {...stroke} />
      <Path d="M3 20a6 6 0 0 1 12 0" stroke={color} {...stroke} />
      <Circle cx={17} cy={9} r={2.5} stroke={color} {...stroke} />
      <Path d="M16 14.5a5 5 0 0 1 5 5.5" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconKeep({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h12v18l-6-4-6 4z" stroke={color} {...stroke} />
    </Svg>
  );
}

export function IconTrash({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke={color} {...stroke} />
    </Svg>
  );
}
