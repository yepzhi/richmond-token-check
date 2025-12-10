# Use the official Node.js 18 image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install NPM dependencies (as root, so we can run install-deps)
RUN npm install

# Install system dependencies for Chromium using Playwright's utility
# This ensures we get exactly the accepted packages for this Debian version
RUN npx playwright install-deps chromium

# Create a user with ID 1000 (required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Change ownership of the app directory to the new user
RUN chown -R user:user /app

# Switch to the new user
USER user

# Install Chromium binary (as the user, so it goes to /home/user/.cache)
RUN npx playwright install chromium

# Copy the rest of the application code
COPY --chown=user:user . .

# Expose the port commonly used by Hugging Face Spaces (7860)
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["node", "server.js"]
