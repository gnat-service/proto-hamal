FROM node:10

WORKDIR /src/
COPY package.json yarn.lock /src/
# Install library dependencies
RUN NODE_ENV=production yarn install

COPY . /src/

ENV STATIC_PROTO_ROOT="/src/static/protos"

EXPOSE 50052

CMD ["yarn", "start"]
