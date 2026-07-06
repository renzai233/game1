export default class BestCandidate {
  // 生成n个均匀分布的点
  public generate(mapWidth: number, mapHeight: number, n: number) {
    if (n < 1) {
      throw new Error("Greater than 0");
    }

    // 已选人
    const result = [this.randomPoint(mapWidth, mapHeight)];

    // 防止过于边缘
    const edgePoints = [
      [0, 0],
      [0, mapHeight / 2],
      [0, mapHeight],
      [mapWidth / 2, 0],
      [mapWidth / 2, mapHeight],
      [mapWidth, 0],
      [mapWidth, mapHeight / 2],
      [mapWidth, mapHeight],
    ].map((e) => ({ x: e[0], y: e[1] }));

    // 候选人数量，越多越均匀，但是性能越差，可以通过四叉树优化
    const candidateNum = mapWidth * 10;

    while (result.length < n) {
      // 本轮「n个候选人」跟「m个已选人」比较距离，得出n个「候选人的最小距离」集合，留下「最大距离」的「候选人」
      let maxDistance = -Infinity;
      let temp = { x: 0, y: 0 };
      for (let i = 0; i < candidateNum; i++) {
        const point = this.randomPoint(mapWidth, mapHeight);
        let minDistance = Infinity;
        for (const item of [...result, ...edgePoints]) {
          minDistance = Math.min(minDistance, this.calculateDistance(point, item));
        }
        if (minDistance > maxDistance) {
          maxDistance = minDistance;
          temp = point;
        }
      }
      result.push(temp);
    }

    return result;
  }

  //随机点
  private randomPoint(mapWidth: number, mapHeight: number) {
    return {
      x: Math.floor(mapWidth * Math.random()),
      y: Math.floor(mapHeight * Math.random()),
    };
  }

  // 勾股定理
  private calculateDistance(
    { x: x1, y: y1 }: ReturnType<typeof this.randomPoint>,
    { x: x2, y: y2 }: ReturnType<typeof this.randomPoint>
  ) {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
  }
}
