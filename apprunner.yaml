version: 1.0
runtime: nodejs22
build:
  commands:
    pre-build:
      - npm install
    build:
      - npm run build
run:
  command: npm start -- -p $PORT
  network:
    port: 3000
    env: PORT
