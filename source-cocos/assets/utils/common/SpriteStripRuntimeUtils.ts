import { Rect, Size, SpriteFrame, Vec2 } from 'cc';

type StripTexture = NonNullable<SpriteFrame['texture']>;
type StripSource = StripTexture | SpriteFrame;

function getTextureFromSource(source: StripSource): StripTexture | null {
    if (!source) {
        return null;
    }

    if (source instanceof SpriteFrame) {
        return source.texture ?? null;
    }

    return source;
}

function getTextureSize(texture: StripTexture): { width: number; height: number } {
    const textureLike = texture as unknown as {
        width?: number;
        height?: number;
        image?: { width?: number; height?: number };
    };

    const width = Number(textureLike.width ?? textureLike.image?.width ?? 0);
    const height = Number(textureLike.height ?? textureLike.image?.height ?? 0);
    return { width, height };
}

export function createStripFrames(
    source: StripSource,
    logPrefix = 'SpriteStripRuntimeUtils',
    resourcePath?: string,
): SpriteFrame[] | null {
    const texture = getTextureFromSource(source);
    if (!texture) {
        console.error(`[${logPrefix}] texture is null${resourcePath ? ` | path=${resourcePath}` : ''}`);
        return null;
    }

    const { width, height } = getTextureSize(texture);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        console.error(`[${logPrefix}] invalid texture size${resourcePath ? ` | path=${resourcePath}` : ''}`, {
            width,
            height,
        });
        return null;
    }

    if (width % height !== 0) {
        console.error(`[${logPrefix}] strip texture width must be divisible by height${resourcePath ? ` | path=${resourcePath}` : ''}`, {
            width,
            height,
        });
        return null;
    }

    const frameCount = width / height;
    const frameWidth = height;
    const frames: SpriteFrame[] = [];

    for (let i = 0; i < frameCount; i += 1) {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(frameWidth * i, 0, frameWidth, height);
        (frame as unknown as { originalSize?: Size }).originalSize = new Size(frameWidth, height);
        (frame as unknown as { offset?: Vec2 }).offset = new Vec2(0, 0);
        frames.push(frame);
    }

    return frames;
}
