# Use the official Node.js 18 image
FROM node:18

# Install system dependencies for Playwright/Chromium
# Based on official playwright docs + usually needed for headless chrome
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatspi0 \
    libx11-xcb1 \
    libdbus-glib-1-2 \
    libgbm1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    libappindicator3-1 \
    libgconf-2-4 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Create a user with ID 1000 (required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Set working directory and change ownership
WORKDIR /app
RUN chown -R user:user /app

# Switch to the new user
USER user

# Copy package files
COPY --chown=user:user package*.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers (Chromium only to save space/time)
# We need to install it as the user so it goes into /home/user/.cache
RUN npx playwright install chromium

# Copy the rest of the application code
COPY --chown=user:user . .

# Expose the port commonly used by Hugging Face Spaces (7860)
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["node", "server.js"]
