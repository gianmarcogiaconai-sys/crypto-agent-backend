const https = require('https');

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += -diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return Math.round(rsi * 100) / 100;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return Math.round(ema * 100) / 100;
}

function calculateMACD(prices) {
  if (prices.length < 26) return null;
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  return {
    macd: Math.round(macdLine * 10000) / 10000,
    signal: Math.round(macdLine * 100) / 100,
    histogram: Math.round((macdLine * 0.3) * 10000) / 10000
  };
}

function calculateBollingerBands(prices, period = 20, stdDevs = 2) {
  if (prices.length < period) return null;
  const lastPrices = prices.slice(-period);
  const sma = lastPrices.reduce((a, b) => a + b) / period;
  const variance = lastPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: Math.round((sma + stdDevs * stdDev) * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round((sma - stdDevs * stdDev) * 100) / 100
  };
}

function calculateATR(highs, lows, closes, period = 14) {
  if (highs.length < period) return null;
  const trueRanges = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  const atr = trueRanges.slice(-period).reduce((a, b) => a + b) / period;
  return Math.round(atr * 100) / 100;
}

function calculateStochastic(highs, lows, closes, period = 14) {
  if (closes.length < period) return null;
  const lastHigh = Math.max(...highs.slice(-period));
  const lastLow = Math.min(...lows.slice(-period));
  const k = ((closes[closes.length - 1] - lastLow) / (lastHigh - lastLow)) * 100;
  return Math.round(k * 100) / 100;
}

function getKuCoinCandles(symbol, timeframe) {
  return new Promise((resolve, reject) => {
    const url = `https://api.kucoin.com/api/v1/market/candles?symbol=${symbol}&type=${timeframe}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const candles = json.data.map(c => ({
            time: parseInt(c[0]),
            open: parseFloat(c[1]),
            close: parseFloat(c[2]),
            high: parseFloat(c[3]),
            low: parseFloat(c[4]),
            volume: parseFloat(c[5])
          }));
          resolve(candles);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function analyzeMarket(symbol, timeframe) {
  try {
    const candles = await getKuCoinCandles(symbol, timeframe);
    if (!candles || candles.length === 0) return { error: 'No data from KuCoin' };
    
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    
    const currentPrice = closes[closes.length - 1];
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const bollinger = calculateBollingerBands(closes, 20, 2);
    const atr = calculateATR(highs, lows, closes, 14);
    const stochastic = calculateStochastic(highs, lows, closes, 14);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    
    let signal = 'NEUTRAL';
    let signalStrength = 0;
    
    if (rsi < 30) signalStrength += 2;
    if (rsi > 70) signalStrength -= 2;
    if (macd && macd.histogram > 0) signalStrength += 1;
    if (ema20 > ema50) signalStrength += 1;
    
    if (signalStrength >= 2) signal = 'BUY';
    else if (signalStrength <= -2) signal = 'SELL';
    
    return {
      symbol,
      timeframe,
      price: currentPrice,
      indicators: {
        rsi,
        macd,
        bollinger,
        atr,
        stochastic,
        ema20,
        ema50
      },
      signal,
      signalStrength,
      candles: candles.slice(-100),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const { symbol = 'SOL-USDT', timeframe = '15min' } = req.query;
  
  const analysis = await analyzeMarket(symbol, timeframe);
  res.status(200).json(analysis);
};
