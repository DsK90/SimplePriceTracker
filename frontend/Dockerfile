FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Postinstall runs generate-env.cjs — scripts/ is not copied yet. prebuild runs after COPY.
RUN npm ci --ignore-scripts
COPY . .
# Passed through to `node scripts/generate-env.cjs` (prebuild) — same vars as repo .env / compose
ARG PAYPAL_CLIENT_ID=
ARG PAYPAL_SANDBOX_CLIENT_ID=
ARG PAYPAL_USE_SANDBOX=true
ARG UMAMI_SCRIPT_URL=
ARG UMAMI_WEBSITE_ID=
ENV PAYPAL_CLIENT_ID=${PAYPAL_CLIENT_ID}
ENV PAYPAL_SANDBOX_CLIENT_ID=${PAYPAL_SANDBOX_CLIENT_ID}
ENV PAYPAL_USE_SANDBOX=${PAYPAL_USE_SANDBOX}
ENV UMAMI_SCRIPT_URL=${UMAMI_SCRIPT_URL}
ENV UMAMI_WEBSITE_ID=${UMAMI_WEBSITE_ID}
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
