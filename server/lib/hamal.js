const hamals = [];

const mapSeries = async (list, cb) => {
  const len = list.length;
  const arr = [];
  for (let i = 0; i < len; i++) {
    arr.push(await cb(list[i], i, list));
  }
  return arr;
};

class Fleet {
  constructor (call, loadDuration, capacity) {
    this.call = call;
    this.loadDuration = loadDuration;
    this.capacity = capacity;
    this.clearCargos();
    this.timer = null;
  }

  async startTimer (cb) {
    if (this.capacity <= 1) {
      return;
    }
    this.clearTimer(); // replace the old timer
    this.timer = {};
    return new Promise(resolve => {
      this.timer.resolve = resolve;
      const callback = () => {
        this.timer && this.timer.resolve();
        cb();
      };
      this.timer.timeout = setTimeout(callback, this.loadDuration);
    });
  }

  clearTimer () {
    if (this.timer !== null) {
      const {timeout, resolve} = this.timer;
      this.timer = null;
      clearTimeout(timeout);
      resolve();
    }
  }

  clearCargos () {
    this.cargoCount = 0;
    this.hasMore = false;
    this.cargos = {};
  }

  sendTruck (hasMore, isPull) {
    if (typeof hasMore !== 'boolean') {
      hasMore = this.hasMore;
    }
    isPull = !!isPull;
    this.clearTimer();
    if (this.cargoCount) {
      this.call.write({hasMore, files: this.cargos, isPull});
      this.clearCargos();
    }
  }

  loadTruck (entry, cargo, hasMore, isPull) {
    if (typeof hasMore === 'boolean') {
      this.hasMore = hasMore;
    }
    const exec = () => this.sendTruck(this.hasMore, isPull);
    this.startTimer(exec);
    this.cargoCount++;
    this.cargos[entry] = cargo;
    if (!this.hasMore || this.cargoCount >= this.capacity) {
      exec();
    }
  }
}

const initHamal = (methods) => {
  class Hamal {
    constructor (call, loadDuration = 100) {
      this.call = call;
      this.parsedOrder = [];
      this.capacity = 1;
      this.loadDuration = loadDuration;
      this._handleStrike();
      this._handleRetire();
      this._handleOrder();
    }

    _handleStrike () {
      this.call.on('error', err => console.error('error emitted:', err.stack));
    }

    _handleRetire () {
      this.call.on('end', () => this.retire());
    }

    _handleOrder () {
      let isPull = true;
      this.call.on('data', async ({sumfile, batchSize}) => {
        await this.submitOrder(sumfile);
        this.setCapacity(batchSize);
        await this.pick(isPull);
      });
    }

    async submitOrder (order) {
      if (order) {
        this.order = order;
        this.parsedOrder = [];
        await this.readOrder((entry, tag) => {
          this.parsedOrder.push({entry, tag});
        });
      }
    }

    findOrder (entry) {
      return this.parsedOrder.find(order => order.entry === entry);
    }

    entryExists (entry) {
      throw new Error(`this method is not implemented yet.`);
    }

    readOrder () {
      throw new Error(`this method is not implemented yet.`);
    }

    isLatestCargo (entry, tag) {
      throw new Error(`this method is not implemented yet.`);
    }

    getCargo (entry, tag) {
      throw new Error(`this method is not implemented yet.`);
    }

    setCapacity (capacity) {
      if (capacity > 0) {
        this.capacity = capacity;
      }
    }

    allocateFleet () {
      return new Fleet(this.call, this.loadDuration, this.capacity);
    }

    async pick (isPull = false) {
      let maxOrderIndex = this.parsedOrder.length - 1;
      const fleet = this.allocateFleet();
      await mapSeries(this.parsedOrder, async ({entry, tag}, i) => {
        const hasMore = maxOrderIndex !== i; // 用于辅助客户端判断是否完成初始化
        if (!this.entryExists(entry)) {
          const error = new Error(`file ${entry} not exists.`);
          error.details = error.stack;
          fleet.loadTruck(entry, {error}, hasMore, isPull);
        } else if (!this.isLatestCargo(entry, tag)) {
          const file = await this.getCargo(entry);
          fleet.loadTruck(entry, {file}, hasMore, isPull);
        } else {
          fleet.loadTruck(entry, {}, hasMore, isPull);
        }
      });
      fleet.sendTruck(false, isPull);
    }

    retire () {
      const idx = hamals.indexOf(this);
      if (idx >= 0) {
        hamals.splice(idx, 1);
      }
      try {
        this.call.end();
      } catch (e) {
        console.error(e.stack);
      }
    }

    static hire (call) {
      const hamal = new Hamal(call);
      hamals.push(hamal);
      return hamal;
    }

    static distribute (files) {
      files = files.filter(({filepath, content, sum}) => filepath && content && sum);
      if (!files.length) {
        return;
      }
      const list = hamals.map(hamal => {
        let orders = files.map(order => {
            const found = hamal.findOrder(order.filepath);
            if (found && found.tag === order.sum) {
              return {...found, content};
            }
          })
          .filter(order => order);

        const result = {hamal, orders, orderCount: orders.length};
        if (orderCount) { // 仅当匹配数量大于 1 时分配 fleet
          result.fleet = hamal.allocateFleet();
        }
      });

      list.forEach(({orders, fleet, orderCount}, i) => {
        if (!fleet) {
          return;
        }
        const hasMore = orderCount - 1 !== i;
        orders.forEach(order => {
          fleet.loadTruck(order.entry, {file: {sum: order.tag, content: order.content}}, hasMore)
        });
        fleet.sendTruck(false);
      });
    }
  }

  Object.assign(Hamal.prototype, methods);
  return {
    hireHamal: Hamal.hire,
    distribute: Hamal.distribute,
  };
};

module.exports = initHamal;
