# Use a Node.js base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the application files
COPY . /app

# Install the Redis client library
# Install the necessary dependencies
RUN npm install ioredis express cors path

# Expose the port for the server
EXPOSE 3000

# Start the server when the container runs
CMD ["node", "server.js"]