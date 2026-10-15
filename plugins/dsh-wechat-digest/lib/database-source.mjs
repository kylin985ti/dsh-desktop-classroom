export const TARGET_GROUP = '尚未配置';
export class DatabaseSource {
  config = { enabled: false }; state = {};
  async start() {} async dispose() {}
  describe() { return { available: false, enabled: false }; }
  async configure() { throw new Error('教学包未启用数据库自动读取'); }
  async sync() { throw new Error('教学包未启用数据库自动读取'); }
}
