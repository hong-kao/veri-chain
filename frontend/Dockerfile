FROM node:20-alpine

WORKDIR /app

# copy manifests first so npm install layer is cached
COPY package*.json ./

RUN npm install

# copy the rest of the source
COPY . .

EXPOSE 5173

# compose overrides this with --host 0.0.0.0 via the command: key
CMD ["npm", "run", "dev"]
