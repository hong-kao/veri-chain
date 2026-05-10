FROM node:20-alpine

WORKDIR /app

# copy manifests first so npm install layer is cached
COPY package*.json ./

RUN npm install

# copy the rest of the source
COPY . .

EXPOSE 3001

# dev: run with tsx directly (no build step needed)
CMD ["npm", "run", "dev"]
