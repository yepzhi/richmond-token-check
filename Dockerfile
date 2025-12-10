# Use the official Node.js 18 image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install NPM dependencies (as root, so we can run install-deps)
RUN npm install

# Install system dependencies for Chromium using Playwright's utility
RUN npx playwright install-deps chromium

# Note: The 'node' image already creates a user named 'node' with UID 1000.
# We will just use that instead of creating a new 'user'.

# Change ownership of the app directory to the node user
RUN chown -R node:node /app

# Switch to the node user
USER node

# Install Chromium binary (as the user, so it goes to /home/node/.cache)
RUN npx playwright install chromium

# Copy the rest of the application code
COPY --chown=node:node . .

# Expose the port commonly used by Hugging Face Spaces (7860)
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["node", "server.js"]
