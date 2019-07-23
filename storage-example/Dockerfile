FROM hqrg.evo.xinpinget.com/gnat/node:10-alpine-build-utils AS build

WORKDIR /src/
COPY package.json yarn.lock /src/
# Install library dependencies
RUN NODE_ENV=production yarn install

####################################################################################################

FROM hqrg.evo.xinpinget.com/gnat/node:10-alpine
#FROM node:10

WORKDIR /src/

COPY --from=build /src /src

COPY . /src/

ENV STATIC_PROTO_ROOT="/src/static/protos"

EXPOSE 50052

CMD ["yarn", "start"]
