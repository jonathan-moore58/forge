FROM node:22-slim

# HF Spaces requires user ID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

COPY --chown=user package*.json ./
RUN npm install

COPY --chown=user . .
RUN npm run build

# HF Spaces default port = 7860
EXPOSE 7860

CMD ["node", "--experimental-sqlite", "dist/index.js"]
