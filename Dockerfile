FROM node:22-alpine
WORKDIR /app
COPY . /app
RUN mkdir -p /app/dist && cp index.html tasks.html editor.html app.css editor.css app.js composer.js editor.js firebase.js manus-routes.json /app/dist/
ENV FRAMEFORGE_STATIC_DIR=/app/dist
EXPOSE 3000
CMD ["node", "server.js"]
