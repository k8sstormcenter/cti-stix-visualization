# Use a Node.js base image
FROM node:22.0.0-alpine3.19

# Set the working directory inside the container
WORKDIR /app

# Copy the application files
COPY . /app

# Install the necessary dependencies
RUN npm install package.json

# Expose the port for the server
EXPOSE 3000

# Start the server when the container runs
CMD ["node", "server.js"]