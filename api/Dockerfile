# Java API. Kontext sestavení: složka api/   (docker build -t planovac-api api/)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src/main ./src/main
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S -G app -u 10001 app
WORKDIR /app
COPY --from=build /build/target/planovac-api.jar ./planovac-api.jar
COPY --from=build /build/target/lib ./lib
USER 10001
ENV PORT=8081 APP_ENV=production
EXPOSE 8081
# SerialGC a menší heap: kontejner má 0,25 vCPU a 0,5 GiB
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:MaxRAMPercentage=65", "-XX:+ExitOnOutOfMemoryError", "-cp", "/app/planovac-api.jar:/app/lib/*", "cz.planovac.api.Main"]
