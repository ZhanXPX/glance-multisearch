# syntax=docker/dockerfile:1
FROM node:20-alpine

# 生产环境更轻
ENV NODE_ENV=production
WORKDIR /app

# 先拷贝依赖文件，利用缓存
COPY package.json package-lock.json* ./

# 如果有 package-lock.json 用 npm ci 更稳定
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 再拷贝代码
COPY . .

# 确保数据目录存在（也方便挂载卷）
RUN mkdir -p /app/data

# 服务端默认监听 3000（也支持用 PORT 环境变量覆盖）
EXPOSE 9100

CMD ["node", "server.js"]
