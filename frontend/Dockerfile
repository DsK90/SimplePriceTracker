FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Postinstall runs generate-env.cjs — scripts/ is not copied yet. prebuild runs after COPY.
RUN npm ci --ignore-scripts
COPY . .
ARG PAYPAL_CLIENT_ID
ARG PAYPAL_SANDBOX_CLIENT_ID
ARG UMAMI_SCRIPT_URL=
ARG UMAMI_WEBSITE_ID=
RUN ID="${PAYPAL_CLIENT_ID:-$PAYPAL_SANDBOX_CLIENT_ID}"; \
    if [ -n "$ID" ]; then \
      sed -i "s|__PAYPAL_CLIENT_ID__|${ID}|g" src/environments/environment.prod.ts; \
    fi
RUN sed -i "s|__UMAMI_SCRIPT_URL__|${UMAMI_SCRIPT_URL}|g" src/environments/environment.prod.ts && \
    sed -i "s|__UMAMI_WEBSITE_ID__|${UMAMI_WEBSITE_ID}|g" src/environments/environment.prod.ts
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
