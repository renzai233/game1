import { _decorator, Component, Node, Color, Graphics, Slider, SpriteFrame, lerp, debug } from "cc";
const { ccclass, property } = _decorator;
import { createUINode, generateNoiseMap, createAveragePoint } from "../Utils";
import { EDM } from "db://assets/utils/data/env/ConfigManager";

// 默认格子大小
const TILE_WIDTH = 4;
const TILE_HEIGHT = 4;
const DEFAULT_MAP_WIDTH = 750;
const DEFAULT_MAP_HEIGHT = 1334;
const TILE_WIDTH_COUNT = 750 / TILE_WIDTH;
const TILE_HEIGHT_COUNT = 1334 / TILE_HEIGHT;

enum TileEnum {
  Dirt, //污垢
  Forest, //森林
  Grass, //草地
  Soil, // 土壤
  Sand, //沙滩
  Sea, //海洋
  Vortex, //涡流
}

// 新增：风格类型定义
export type MapTheme = 'ice' | 'fire' | 'forest' | 'ocean' | 'desert';

@ccclass("MapManager")
export class MapManager extends Component {
  //颜色
  @property(Color)
  dirt: Color = new Color("#4D3D35");
  @property(Color)
  forest: Color = new Color("#3D6112");
  @property(Color)
  grass: Color = new Color("#518A14");
  @property(Color)
  soil: Color = new Color("#B2824E");
  @property(Color)
  sand: Color = new Color("#E5D8B8");
  @property(Color)
  sea: Color = new Color("#00A0EE");
  @property(Color)
  vortex: Color = new Color("#0063C7");

  // 画布节点
  tileMap: Node = null;

  // tile信息
  tiles: Array<Array<{ type: TileEnum }>> = [];

  //噪音地图信息
  noiseMap: number[][] = [];

  // 地图参数
  seed = 1;
  scale = 40;
  octaves = 5;
  persistance = 0.5;
  lacunarity = 2;
  offsetX = 0;
  offsetY = 0;

  // 地形阈值
  threshold = [
    { value: 0.85, color: this.dirt, type: TileEnum.Dirt },
    { value: 0.6, color: this.forest, type: TileEnum.Forest },
    { value: 0.5, color: this.grass, type: TileEnum.Grass },
    { value: 0.45, color: this.soil, type: TileEnum.Soil },
    { value: 0.4, color: this.sand, type: TileEnum.Sand },
    { value: 0.15, color: this.sea, type: TileEnum.Sea },
    { value: 0, color: this.vortex, type: TileEnum.Vortex },
  ];

  //   threshold = [
  //     { value: 0.85, color: this.dirt, type: TileEnum.Dirt },
  //     { value: 0.7, color: this.forest, type: TileEnum.Forest },
  //     { value: 0.4, color: this.grass, type: TileEnum.Grass },
  //     { value: 0.3, color: this.soil, type: TileEnum.Soil },
  //     { value: 0, color: this.sand, type: TileEnum.Sand },
  //     // { value: 0.15, color: this.sea, type: TileEnum.Sea },
  //     // { value: 0, color: this.vortex, type: TileEnum.Vortex },
  //   ];

  // 新增：风格主题色表
  static ThemeConfig: Record<MapTheme, { threshold: { value: number; color: Color; type: TileEnum }[] }> = {
    ice: {
      threshold: [
        { value: 0.85, color: new Color('#B0E0FF'), type: TileEnum.Dirt }, // 冰原
        { value: 0.6, color: new Color('#AEEFFF'), type: TileEnum.Forest }, // 冰林
        { value: 0.5, color: new Color('#D0F8FF'), type: TileEnum.Grass }, // 雪地
        { value: 0.45, color: new Color('#E0F8FF'), type: TileEnum.Soil }, // 雪土
        { value: 0.4, color: new Color('#F0FFFF'), type: TileEnum.Sand }, // 雪沙
        { value: 0.15, color: new Color('#A0D8FF'), type: TileEnum.Sea }, // 冰海
        { value: 0, color: new Color('#6EC6FF'), type: TileEnum.Vortex }, // 冰涡
      ],
    },
    fire: {
      threshold: [
        { value: 0.85, color: new Color('#7B2E00'), type: TileEnum.Dirt }, // 熔岩
        { value: 0.6, color: new Color('#B22222'), type: TileEnum.Forest }, // 火林
        { value: 0.5, color: new Color('#FF4500'), type: TileEnum.Grass }, // 火地
        { value: 0.45, color: new Color('#FFA07A'), type: TileEnum.Soil }, // 灰烬
        { value: 0.4, color: new Color('#FFD700'), type: TileEnum.Sand }, // 金沙
        { value: 0.15, color: new Color('#FF6347'), type: TileEnum.Sea }, // 熔浆
        { value: 0, color: new Color('#C71585'), type: TileEnum.Vortex }, // 火涡
      ],
    },
    forest: {
      threshold: [
        { value: 0.85, color: new Color('#4D3D35'), type: TileEnum.Dirt },
        { value: 0.6, color: new Color('#3D6112'), type: TileEnum.Forest },
        { value: 0.5, color: new Color('#518A14'), type: TileEnum.Grass },
        { value: 0.45, color: new Color('#B2824E'), type: TileEnum.Soil },
        { value: 0.4, color: new Color('#E5D8B8'), type: TileEnum.Sand },
        { value: 0.15, color: new Color('#00A0EE'), type: TileEnum.Sea },
        { value: 0, color: new Color('#0063C7'), type: TileEnum.Vortex },
      ],
    },
    ocean: {
      threshold: [
        { value: 0.85, color: new Color('#1E90FF'), type: TileEnum.Dirt },
        { value: 0.6, color: new Color('#00BFFF'), type: TileEnum.Forest },
        { value: 0.5, color: new Color('#87CEFA'), type: TileEnum.Grass },
        { value: 0.45, color: new Color('#B0E0E6'), type: TileEnum.Soil },
        { value: 0.4, color: new Color('#E0FFFF'), type: TileEnum.Sand },
        { value: 0.15, color: new Color('#0077BE'), type: TileEnum.Sea },
        { value: 0, color: new Color('#005577'), type: TileEnum.Vortex },
      ],
    },
    desert: {
      threshold: [
        { value: 0.85, color: new Color('#C2B280'), type: TileEnum.Dirt },
        { value: 0.6, color: new Color('#EEDC82'), type: TileEnum.Forest },
        { value: 0.5, color: new Color('#F5DEB3'), type: TileEnum.Grass },
        { value: 0.45, color: new Color('#FFD700'), type: TileEnum.Soil },
        { value: 0.4, color: new Color('#FFF8DC'), type: TileEnum.Sand },
        { value: 0.15, color: new Color('#E0CDA9'), type: TileEnum.Sea },
        { value: 0, color: new Color('#C2B280'), type: TileEnum.Vortex },
      ],
    },
  };

  start() {
    this.generateNode();
    this.generateMap();
  }

  generateNode() {
    const stage = this.node.getChildByName("Stage");
    this.tileMap = createUINode({
      width: EDM.config.viewWidth,
      height: EDM.config.viewHeight,
      parent: stage,
    });
    this.tileMap.addComponent(Graphics);
  }

  generateMap() {
    this.generateNoise();
    this.generateTile();
    // this.generateResource();
  }

  generateNoise() {
    this.noiseMap = generateNoiseMap(
      TILE_WIDTH_COUNT,
      TILE_HEIGHT_COUNT,
      this.seed,
      this.scale,
      this.octaves,
      this.persistance,
      this.lacunarity,
      {
        x: this.offsetX,
        y: this.offsetY,
      }
    );
  }

  generateTile() {
    const graphics = this.tileMap.getComponent(Graphics);
    //清空UI和数据
    graphics.clear();
    this.tiles = Array.from({ length: TILE_WIDTH_COUNT }, () =>
      Array.from({ length: TILE_HEIGHT_COUNT }, () => ({ type: TileEnum.Sea }))
    );

    // 生成UI和数据
    for (let x = 0; x < TILE_WIDTH_COUNT; x++) {
      for (let y = 0; y < TILE_HEIGHT_COUNT; y++) {
        const noiseValue = this.noiseMap[x][y];
        const target = this.threshold.find((e) => noiseValue >= e.value);
        if (!target) {
          continue;
        }

        //UI
        const posX = TILE_WIDTH * x - DEFAULT_MAP_WIDTH / 2;
        const posY = TILE_WIDTH * y - DEFAULT_MAP_HEIGHT / 2;
        graphics.fillColor.fromHEX(`#${target.color.toHEX()}`);
        // const v = noiseValue * 255;

        // graphics.fillColor.fromHEX(new Color(v, v, v, 255).toHEX());
        graphics.fillRect(posX, posY, TILE_WIDTH, TILE_WIDTH);

        //数据
        this.tiles[x][y] = { type: target.type };
      }
    }
  }

  async sliderChange(slider: Slider) {
    // 防抖
    this.unscheduleAllCallbacks();
    await new Promise((rs) => this.scheduleOnce(rs, 0.016));

    // 获得值和节点name
    const value = slider.progress;
    const name = slider.node.name;
    console.log(name, value);

    switch (name) {
      case "Scale":
        this.scale = Math.floor(lerp(10, 100, value));
        break;
      case "Octaves":
        this.octaves = Math.floor(lerp(3, 7, value));
        break;
      case "Persistance":
        this.persistance = lerp(0.4, 1, value);
        break;
      case "Lacunarity":
        this.lacunarity = lerp(2, 6, value);
        break;
      case "OffsetX":
        this.offsetX = value;
        break;
      case "OffsetY":
        this.offsetY = value;
        break;
      default:
        break;
    }

    this.generateMap();
  }

  saveData() {
    console.log(
      JSON.stringify({
        seed: this.seed,
        noiseMap: this.noiseMap,
        width: TILE_WIDTH_COUNT,
        height: TILE_HEIGHT_COUNT,
        scale: this.scale,
        octaves: this.octaves,
        persistance: this.persistance,
        lacunarity: this.lacunarity,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
      })
    );
  }

  generateResource() {
    const graphics = this.tileMap.getComponent(Graphics);
    const areaX = (DEFAULT_MAP_WIDTH * 9) / 10;
    const areaY = (DEFAULT_MAP_HEIGHT * 9) / 10;
    const points = createAveragePoint(areaX, areaY, 100);
    for (const { x, y } of points) {
      const posX = x - areaX / 2;
      const posY = y - areaY / 2;
      graphics.fillColor.fromHEX("#A66FE8");
      graphics.fillRect(posX, posY, TILE_WIDTH * 2, TILE_WIDTH * 2);
    }
  }

  /**
   * 生成指定风格的地图数据
   * @param theme 地图风格
   * @param seed 随机种子
   * @param size 可选，地图宽高
   * @returns { noiseMap, threshold, params, width, height, tileWidth, tileHeight, tileWidthCount, tileHeightCount }
   */
  static generateMapData(theme: MapTheme, seed: number = 1, size?: { width: number, height: number }, bgColorOrColors?: string | string[]) {
    const config = MapManager.ThemeConfig[theme] || MapManager.ThemeConfig['forest'];
    // 动态计算宽高和格子数
    const width = size?.width || DEFAULT_MAP_WIDTH;
    const height = size?.height || DEFAULT_MAP_HEIGHT;
    const tileWidth = TILE_WIDTH;
    const tileHeight = TILE_HEIGHT;
    const tileWidthCount = Math.round(width / tileWidth);
    const tileHeightCount = Math.round(height / tileHeight);
    // 这里参数可根据需要调整
    const scale = 40;
    const octaves = 5;
    const persistance = 0.5;
    const lacunarity = 2;
    const offsetX = 0;
    const offsetY = 0;
    const noiseMap = generateNoiseMap(
      tileWidthCount,
      tileHeightCount,
      seed,
      scale,
      octaves,
      persistance,
      lacunarity,
      { x: offsetX, y: offsetY }
    );
    // 颜色优先级：bgColors > bgColor > 主题色 > 随机色
    let mainColors: string[] = [];
    if (Array.isArray(bgColorOrColors)) {
      mainColors = bgColorOrColors.filter(Boolean);
    } else if (typeof bgColorOrColors === 'string' && bgColorOrColors.length > 0) {
      mainColors = [bgColorOrColors];
    }
    // 如果只配置了一个颜色，自动生成5个渐变色
    if (mainColors.length === 1) {
      const base = new Color();
      Color.fromHEX(base, mainColors[0]);
      mainColors = [base.toHEX()];
      for (let i = 1; i <= 5; i++) {
        // 生成明暗变化色
        const factor = 0.5 + 0.1 * i; // 0.6~1.0
        const c = new Color(
          Math.min(255, Math.round(base.r * factor)),
          Math.min(255, Math.round(base.g * factor)),
          Math.min(255, Math.round(base.b * factor)),
          255
        );
        mainColors.push(c.toHEX());
      }
    }
    // threshold生成
    let threshold = config.threshold;
    if (mainColors.length > 0) {
      // 用mainColors随机分配给threshold
      threshold = config.threshold.map((t, idx) => {
        const hex = mainColors[Math.floor(Math.random() * mainColors.length)];
        const c = new Color();
        Color.fromHEX(c, hex);
        return { ...t, color: c };
      });
    }
    // 兼容旧mainColor逻辑
    let mainColor = mainColors[0] || undefined;
    if (!mainColor) {
      // 主题色取threshold第一个
      mainColor = config.threshold[0]?.color?.toHEX?.() ? `#${config.threshold[0].color.toHEX()}` : undefined;
    }
    if (!mainColor) {
      // 随机色
      let hex = Math.floor(Math.random()*16777215).toString(16);
      while (hex.length < 6) hex = '0' + hex;
      mainColor = `#${hex}`;
    }
    return {
      noiseMap,
      threshold,
      params: { seed, scale, octaves, persistance, lacunarity, offsetX, offsetY },
      width,
      height,
      tileWidth,
      tileHeight,
      tileWidthCount,
      tileHeightCount,
      mainColor,
    };
  }

  /**
   * 渲染地图到指定节点
   * @param parentNode 父节点
   * @param mapData generateMapData返回的数据
   * @param size 可选，地图宽高
   */
  static renderMap(parentNode: Node, mapData: any, size?: { width: number, height: number }) {
    // 清理旧地图
    let old = parentNode.getChildByName('MapTileNode');
    if (old) old.destroy();
    // 优先用mapData里的宽高和格子数
    let width = mapData.width || size?.width || DEFAULT_MAP_WIDTH;
    let height = mapData.height || size?.height || DEFAULT_MAP_HEIGHT;
    let tileWidthCount = mapData.tileWidthCount || Math.round(width / TILE_WIDTH);
    let tileHeightCount = mapData.tileHeightCount || Math.round(height / TILE_HEIGHT);
    let tileWidth = mapData.tileWidth || width / tileWidthCount;
    let tileHeight = mapData.tileHeight || height / tileHeightCount;
    const tileMap = createUINode({
      name: 'MapTileNode',
      width,
      height,
      parent: parentNode,
    });
    const graphics = tileMap.addComponent(Graphics);
    for (let x = 0; x < tileWidthCount; x++) {
      for (let y = 0; y < tileHeightCount; y++) {
        const noiseValue = mapData.noiseMap[x][y];
        let target = mapData.threshold.find((e) => noiseValue >= e.value);
        if (!target) continue;
        // 修复反序列化color为普通对象问题
        if (!(target.color instanceof Color)) {
          const c = target.color;
          target.color = new Color(c.r, c.g, c.b, c.a ?? 255);
        }
        const posX = tileWidth * x - width / 2;
        const posY = tileHeight * y - height / 2;
        graphics.fillColor.fromHEX(`#${target.color.toHEX()}`);
        graphics.fillRect(posX, posY, tileWidth, tileHeight);
      }
    }
    return tileMap;
  }
}
