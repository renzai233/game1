import { Asset, director, Graphics, Rect, resources, SpriteFrame, Vec3, Node, Mask, UITransform, Sprite, Prefab, assetManager, AudioClip, error, warn } from "cc";
import { gameBus } from './signal/GameBus';
export * from './common';
export * from './subutils';


// 计算数组之和
const computedSum = (arr: number[]) => {
  let sum = arr.reduce((accumulator, currentValue) => {
    return accumulator + currentValue;
  }, 0);
  return sum
}
export { computedSum }

// 随机排序，Fisher-Yates洗牌算法，这是一种时间复杂度为O(n)的算法
const fisherYatesShuffle = (array: any[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
export { fisherYatesShuffle }

// 加载资源（支持Prefab和SpriteFrame）
export const loadAsset = (path, callback, type = null) => {
  // 添加参数验证
  if (!path) {
    console.warn('[loadAsset] path 参数为空或undefined');
    callback && callback(null);
    return;
  }

  let assetType = type;
  if (!assetType) {
    if (path.endsWith('.prefab') || path.indexOf('prefab/') !== -1) {
      assetType = Prefab;
    } else {
      assetType = SpriteFrame;
    }
  }
  resources.load(path, assetType, (err: Error, data: Asset) => {
    if (err) {
      console.log(err)
      return
    }
    callback && callback(data)
  })
}

export const loadResSingleAsset = (path, callback, type = null) => {
  // 1. 空路径直接返回null，不执行加载
  if (!path) {
    console.warn('[loadResSingleAsset] path 参数为空或undefined');
    callback && callback(null);
    return;
  }

  let assetType = type;
  // 2. 自动判断资源类型
  if (!assetType) {
    if (path.endsWith('.prefab') || path.indexOf('prefab/') !== -1) {
      assetType = Prefab;
    } else if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.ogg') || path.endsWith('.m4a')) {
      assetType = AudioClip;
    } else {
      assetType = SpriteFrame;
    }
  } else if (assetType === AudioClip) {
    assetType = AudioClip;
  }

  // 3. 加载分包（核心：加try/catch捕获同步错误）
  assetManager.loadBundle('res', (err, bundle) => {
    if (err) {
      error('分包加载失败:', err);
      callback && callback(null); // 必执行回调，返回null
      return;
    }

    // 4. 加载资源（核心：用try/catch包裹bundle.load，捕获同步抛错）
    try {
      bundle.load(path, assetType, (err: Error, data: Asset) => {
        if (err) {
          warn(`[loadResSingleAsset] 资源加载失败（非致命）: ${path}`, err.message); // 仅打印警告，不抛Error
          callback && callback(null); // 失败返回null
          return;
        }
        callback && callback(data); // 成功返回资源
      });
    } catch (syncErr) {
      // 捕获bundle.load的同步错误（关键：解决你的报错）
      warn(`[loadResSingleAsset] 资源加载同步错误（非致命）: ${path}`, syncErr.message);
      callback && callback(null); // 同步错误也返回null
    }
  })
}

// 加载资源（支持Prefab和SpriteFrame）
export const loadResAsset = (path, config, callback) => {
  // 添加参数验证
  if (!path) {
    console.warn('[loadResAsset] path 参数为空或undefined');
    callback && callback(null);
    return;
  }

  if (!config) {
    console.warn('[loadResAsset] config 参数为空或undefined');
    callback && callback(null);
    return;
  }

  assetManager.loadBundle('res', (err, bundle) => {
    if (err) {
      console.error('分包加载失败:', err);
      return;
    }
    // 第二步：从分包加载具体图片
    bundle.load(path, SpriteFrame, (err: Error, data: Asset) => {

      if (err) {
        console.error('[loadResAsset] 加载资源失败:', err);
        callback && callback(null);
        return
      }

      // 检查 data 是否存在
      if (!data) {
        console.error('[loadResAsset] 加载的资源数据为空', path);
        callback && callback(null);
        return;
      }

      // 获取精灵图
      const getSpriteFrame = (x, y, width, height) => {
        let spriteFrame = new SpriteFrame();
        spriteFrame.texture = data as any; // 纹理是您导入的PNG图
        spriteFrame.rect = new Rect(x, y, width, height); // x, y, width, height是图标的位置和尺寸
        return spriteFrame
      }

      // 添加空值检查，确保配置属性存在
      if (!config["width"] || !config["item_width"] || !config["height"] || !config["item_height"]) {
        console.error('[loadResAsset] 配置参数不完整', config);
        callback && callback(null);
        return;
      }

      let xLen = Math.floor(config["width"] / config["item_width"]) // 横向分隔
      let yLen = Math.floor(config["height"] / config["item_height"]) // 纵向分隔
      let spriteFrames = []


      for (let i = 0; i < yLen; i++) {
        for (let j = 0; j < xLen; j++) {
          let sf = getSpriteFrame(config["item_width"] * j, config["item_height"] * i, config["item_width"], config["item_height"])
          spriteFrames.push(sf)
        }
      }

      callback && callback(spriteFrames)
    })
  })
}

// 加载图集资源
const loadAtlasAsset = (path, config: object, callback) => {

  // 添加空值检查，确保 path 和 config 存在
  if (!path) {
    console.error('[loadAtlasAsset] path 参数为空或undefined');
    callback && callback(null);
    return;
  }

  if (!config) {
    console.error('[loadAtlasAsset] config 参数为空', path);
    callback && callback(null);
    return;
  }

  resources.load(path, SpriteFrame, (err: Error, data: Asset) => {

    if (err) {
      console.error('[loadAtlasAsset] 加载资源失败:', err);
      callback && callback(null);
      return
    }

    // 检查 data 是否存在
    if (!data) {
      console.error('[loadAtlasAsset] 加载的资源数据为空', path);
      callback && callback(null);
      return;
    }

    // 获取精灵图
    const getSpriteFrame = (x, y, width, height) => {
      let spriteFrame = new SpriteFrame();
      spriteFrame.texture = data as any; // 纹理是您导入的PNG图
      spriteFrame.rect = new Rect(x, y, width, height); // x, y, width, height是图标的位置和尺寸
      return spriteFrame
    }

    // 添加空值检查，确保配置属性存在
    if (!config["width"] || !config["item_width"] || !config["height"] || !config["item_height"]) {
      console.error('[loadAtlasAsset] 配置参数不完整', config);
      callback && callback(null);
      return;
    }

    let xLen = Math.floor(config["width"] / config["item_width"]) // 横向分隔
    let yLen = Math.floor(config["height"] / config["item_height"]) // 纵向分隔
    let spriteFrames = []


    for (let i = 0; i < yLen; i++) {
      for (let j = 0; j < xLen; j++) {
        let sf = getSpriteFrame(config["item_width"] * j, config["item_height"] * i, config["item_width"], config["item_height"])
        spriteFrames.push(sf)
      }
    }

    callback && callback(spriteFrames)
  })
}
export { loadAtlasAsset }

// 计算两节点角度
const computedAngle = (source, target) => {

  if (!source || !target) {
    return null
  }

  let startPos = source.getWorldPosition()
  let endPos = target.getWorldPosition()

  // 计算方向向量
  let direction = new Vec3(endPos.x - startPos.x, endPos.y - startPos.y, 0);
  direction.normalize();

  // 计算角度
  let angle = Math.atan2(direction.y, direction.x) * 180 / Math.PI;

  return angle
}
export { computedAngle }

// 获取当前场景下的子节点
const getNode = (nodeName) => {
  let scene = director.getScene()
  let canvasNode = scene.children.find(v => v.name === "Canvas")
  let node = null
  const inter = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].name === nodeName) {
        node = arr[i]
        break
      }
      if (arr[i].children && arr[i].children.length > 0) {
        inter(arr[i].children)
      }
    }
  }
  inter(canvasNode.children)

  return node
}
export { getNode }

// 获取当前场景下的子节点
const getNodes = (nodeName) => {
  let scene = director.getScene()
  let canvasNode = scene.children.find(v => v.name === "Canvas")
  let nodeArr = []
  const inter = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].name === nodeName) {
        nodeArr.push(arr[i])
      }
      if (arr[i].children && arr[i].children.length > 0) {
        inter(arr[i].children)
      }
    }
  }
  inter(canvasNode.children)

  return nodeArr
}
export { getNodes }

// 判断两个日期是否相差一天，用来处理每日福利更新逻辑
const isNextDay = (date1, date2) => {
  // 将两个日期都转换为当天的0点（即午夜）
  let startOfDay1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  let startOfDay2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());

  // 计算两个日期的差值（以毫秒为单位）
  const diffInMs = Number(startOfDay2) - Number(startOfDay1)

  // 一天的毫秒数
  const oneDayInMs = 24 * 60 * 60 * 1000;

  // 判断两个日期是否至少相差一天
  return diffInMs >= oneDayInMs;
}
export { isNextDay }

// 暂停
const onPause = (reason?: any) => {
  gameBus.pause(reason)
}
export { onPause }

// 继续
const onContinue = (reason?: any) => {
  gameBus.resume(reason)
}
export { onContinue }
