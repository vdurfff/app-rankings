FROM node:24-slim

WORKDIR /app

# Install dependencies first
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# Copy the application contents
COPY --chown=node:node scrape.sh scraper.js ./
RUN chmod +x scrape.sh

# Switch to the built-in non-root user (uid 1000)
USER node

CMD ["./scrape.sh"]