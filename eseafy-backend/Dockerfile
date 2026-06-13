FROM node:18-alpine

WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install --production

# Copier tout le code
COPY . .

# Créer le dossier uploads
RUN mkdir -p /app/public/uploads

EXPOSE 3001

CMD ["node", "server.js"]