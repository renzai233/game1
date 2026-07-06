import { Layers, Node, SpriteFrame, UITransform, Sprite } from "cc";
import PerlinNoise from "./PerlinNoise";
import BestCandidate from "./BestCandidate";

/***
 * 根据百分比得出值
 */
export const lerp = (min: number, max: number, rate: number) => {
  return min + (max - min) * rate;
};

/***
 * 根据值得出百分比
 */
export const invertLerp = (min: number, max: number, value: number) => {
  return (value - min) / (max - min);
};

export const clamp = (min: number, max: number, value) => {
  return Math.max(max, Math.min(min, value));
};

/***
 * 伪随机数生成器
 * 返回一个对象，调用其next方法获得0到1之间的伪随机数
 */
export const randomGenerator = (seed: number) => {
  const iterator = {
    next() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    },
  };

  return iterator;
};

/***
 * 创建UI节点，并设置常用属性
 */
export const createUINode = ({
  name = "",
  width = 0,
  height = 0,
  spriteFrame = null,
  parent = null,
  x = 0,
  y = 0,
}: {
  name?: string;
  width?: number;
  height?: number;
  spriteFrame?: SpriteFrame;
  parent?: Node;
  x?: number;
  y?: number;
}) => {
  const getUIMaskNumber = () => 1 << Layers.nameToLayer("UI_2D");
  // 实例化
  const node = new Node(name);
  // UI层级
  node.layer = getUIMaskNumber();
  //添加组件
  const transform = node.addComponent(UITransform);
  if (spriteFrame) {
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = spriteFrame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  }
  // 先设置图片再设置大小
  transform.setContentSize(width, height);
  //父节点
  if (parent) {
    node.setParent(parent);
  }
  // 位置
  node.setPosition(x, y);
  //锚点
  transform.setAnchorPoint(0, 0);
  // 返回实例
  return node;
};

/***
 * 基于柏林噪音生成二维数组
 */
export const generateNoiseMap = (
  mapWidth: number,
  mapHeight: number,
  seed: number,
  scale: number,
  octaves: number,
  persistance: number,
  lacunarity: number,
  offset: { x: number; y: number }
) => {
  // 柏林噪音算法
  const perlinNoise = new PerlinNoise().seed(seed);

  let maxNoiseHeight = -Infinity;
  let minNoiseHeight = Infinity;

  const noiseMap: Array<Array<number>> = Array.from({ length: mapWidth }, () =>
    Array.from({ length: mapHeight }, () => 0)
  );

  const halfWidth = mapWidth / 2;
  const halfHeight = mapHeight / 2;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      let amplitude = 1;
      let frequency = 1;
      let noiseHeight = 0;
      for (let i = 0; i < octaves; i++) {
        const sampleX = ((x - halfWidth + offset.x * mapWidth) / scale) * frequency;
        const sampleY = ((y - halfHeight + offset.y * mapHeight) / scale) * frequency;
        const perlinValue = perlinNoise.noise(sampleX, sampleY) * 2 - 1;
        noiseHeight += perlinValue * amplitude;
        amplitude *= persistance;
        frequency *= lacunarity;
      }

      if (noiseHeight > maxNoiseHeight) {
        maxNoiseHeight = noiseHeight;
      } else if (noiseHeight < minNoiseHeight) {
        minNoiseHeight = noiseHeight;
      }
      noiseMap[x][y] = noiseHeight;
    }
  }

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      noiseMap[x][y] = Number(invertLerp(minNoiseHeight, maxNoiseHeight, noiseMap[x][y]).toFixed(3));
    }
  }

  return noiseMap;
};

/***
 * 生成均匀的坐标
 */
export const createAveragePoint = (mapWidth: number, mapHeight: number, count: number) => {
  // //米切尔最佳候选算法
  const bestCandidate = new BestCandidate();
  return bestCandidate.generate(mapWidth, mapHeight, count);
};
