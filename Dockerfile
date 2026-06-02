FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY .env.example ./

ENV PORT=5173
ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["npm", "start"]
