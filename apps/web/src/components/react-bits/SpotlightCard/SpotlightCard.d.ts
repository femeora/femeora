import React from 'react';
import './SpotlightCard.css';
export type SpotlightShape = 'circle' | 'beam';
export type SpotlightCardProps = React.HTMLAttributes<HTMLDivElement> & {
    spotlightColor?: string;
    intensity?: number;
    spotlightSize?: number;
    softness?: number;
    shape?: SpotlightShape;
    borderGlow?: number;
    proximity?: number;
    smoothing?: number;
    ambient?: boolean;
    flare?: boolean;
    grain?: number;
    theme?: 'dark' | 'light';
};
declare const SpotlightCard: ({ children, className, style, spotlightColor, intensity, spotlightSize, softness, shape, borderGlow, proximity, smoothing, ambient, flare, grain, theme, ...rest }: SpotlightCardProps) => React.JSX.Element;
export default SpotlightCard;
