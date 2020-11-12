const Kafka = require('node-rdkafka');
const bunyan = require('bunyan');
const yargs = require('yargs/yargs')
const logger = bunyan.createLogger({name: "myapp"});

const argv = yargs(process.argv.slice(2))
  .options({
    'batchSize': {
      alias: 's',
      describe: 'number of messages to be sent parallely in a batch',
      demandOption: true,
      type: 'number',
    },
    'batchInterval': {
      alias: 'i',
      describe: 'time in seconds for the next batch of messages',
      type: 'number'
    },
    'batchIntervalms': {
      alias: 'm',
      describe: 'time in milliseconds for the next batch of messages',
      type: 'number',
      conflicts: 'batchInterval'
    },
    'topicName': {
      alias: 't',
      describe: 'Topic Name',
      type: 'string',
      demandOption: true
    },
    'brokersList': {
      alias: 'l',
      describe: 'comma separated broker list e.g. broker1:9092,broker2:9092',
      type: 'string',
      demandOption: true
    },
  })
  .check((argv, options) => {
    if (typeof argv.batchSize !== 'undefined' && isNaN(argv.batchSize)) {
      console.error('batchSize must be a number')  
      process.exit(6)
    }
    if (typeof argv.batchInterval !== 'undefined' && isNaN(argv.batchInterval)) {
      console.error('batchInterval must be a number')  
      process.exit(6)
    }
    if (typeof argv.batchIntervalms !== 'undefined' && isNaN(argv.batchIntervalms)) {
      console.error('batchIntervalms must be a number')  
      process.exit(6)
    }
    if (argv.batchInterval && argv.batchIntervalms) {
      console.error('batchInterval and batchIntervalms are mutually exclusive options. Specify only one.')
      process.exit(6)
    }
    return true
  })
  .help()
  .argv

const brokersList = argv.brokersList;
const messageBatchSize = Number(argv.batchSize)
const batchInterval = Number(argv.batchInterval) * 1000 || Number(argv.batchIntervalms)
const topicName = argv.topicName
const partitionNum = 2
const replicationFactor = 2
let globalCount = 1
let batchMessageInterval

//==================== functions ====================//
function produceMessages(count) {
  let localCount = globalCount;
  for ( let i=globalCount; i < count + localCount; i++, globalCount++) {
    try {
      producer.produce(
        'ha-topic',
        null,
        Buffer.from(`Awesome message - ${i}`),
        'Stormwind',
        Date.now(),
      );
      logger.info(`Message ${i} sent successfully`);
      //producer.emit('event.stats');
      //producer.disconnect();
    } catch (err) {
      logger.error(`A problem occurred when sending our message - ${i} `, err);
    }
  }
}

function sendBatchMessagesAfterInterval(messageCount, batchInterval) {
  batchMessageInterval = setInterval(() => {
    produceMessages(messageCount)
  }, batchInterval)
}

//==================== main ====================//
const client = Kafka.AdminClient.create({
  'client.id': 'first-client',
  'metadata.broker.list': brokersList
});

let producer = new Kafka.Producer({
  'metadata.broker.list': brokersList,
  'client.id': 'first-client',
  'dr_cb': true,
  'event_cb': true,
  'retry.backoff.ms': 200,
  'message.send.max.retries': 1,
  'socket.keepalive.enable': false,
  'queue.buffering.max.messages': 10,
  'queue.buffering.max.ms': 1000,
  //'statistics.interval.ms': 10000,
  //'debug': 'all'
});

client.deleteTopic(topicName, 4000, (err) => {
  if (err) {
    logger.error('could not delete topic..', err.message)
  } else { 
    logger.info(`Topic ${topicName} deleted successfully...`)
  }

  setTimeout(() => {
    client.createTopic({
      topic: topicName,
      num_partitions: partitionNum,
      timeout: 4000,
      replication_factor: replicationFactor
    }, (err) => {
      if (err) {
        logger.fatal('could not create topic..', err.message)
        process.exit(4)
      }
      logger.info(`Topic ${topicName} created successfully....`)
      producer.connect({}, (err, data) => {
        if (err) {
          logger.fatal(err);
          process.exit(3);
        }
        logger.info("producer connected Successfully. connection info = ", data);
      });
    });
  }, 2000)
})

//==================== events ====================//
producer.on('ready', () => {
  setTimeout(() => {
    sendBatchMessagesAfterInterval(messageBatchSize, batchInterval)
  }, 2000)
});

producer.on('event.error', (err) => {
  logger.error('Error from event.error', err);
  if (err.message === 'all broker connections are down') {
    clearInterval(batchMessageInterval)
    producer.disconnect()
    //process.exit(7)
  } else {
    producer.getMetadata({topic: topicName}, (err, metadata) => {
      if (err) {
        logger.error('Error getting metadata in event.error', err);
      } else {
        logger.info('Got metadata = ', metadata);
      }
    });
  }
})

producer.on('event', (data) => {
  logger.info('data from event', data);
})

producer.on('event.log', (data) => {
  logger.info('data from event.log', data);
})

producer.on('event.stats', (stats) => {
  logger.info('stats from event.stats ', stats);
})

producer.on('disconnected', (data) => {
  logger.info('Disconnected successfully ', data);
});

producer.setPollInterval(100);
