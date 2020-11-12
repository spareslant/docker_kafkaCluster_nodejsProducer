#### Start 2 node kafka cluster in docker
- `docker-compose up -d`
#### Start injecting message using following command.
- `node kafka_producer.js -s 1  -i 1  -t ha-topic -l localhost:19092,localhost:29092 | ./node_modules/.bin/bunyan`
