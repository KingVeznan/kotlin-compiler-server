import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Защита от спама
const requestCounts = new Map();
const MAX_REQUESTS_PER_HOUR = 100;

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: "Kotlin Compiler Server is running!",
    version: "1.0.0",
    endpoint: "/compile"
  });
});

// Эндпоинт компиляции
app.post('/compile', async (req, res) => {
  const ip = req.ip || 'unknown';
  const count = (requestCounts.get(ip) || 0) + 1;
  
  if (count > MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ 
      error: 'Слишком много запросов. Попробуйте через час.' 
    });
  }
  requestCounts.set(ip, count);
  setTimeout(() => requestCounts.set(ip, count - 1), 3600000);

  try {
    const { code } = req.body;
    
    if (!code || code.length > 5000) {
      return res.status(400).json({ 
        error: 'Код не предоставлен или слишком длинный' 
      });
    }

    // Исправление кода
    const fixedCode = fixKotlinCode(code);
    
    // Отправка в JDoodle
    const response = await axios.post(
      'https://api.jdoodle.com/v1/execute',
      {
        script: fixedCode,
        language: 'kotlin',
        versionIndex: '0',
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET
      },
      { timeout: 15000 }
    );

    res.json({
      success: true,
      output: response.data.output || 'Нет вывода',
      cpuTime: response.data.cpuTime
    });

  } catch (error) {
    console.error('Ошибка:', error.message);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Исправление кода
function fixKotlinCode(rawCode) {
  let code = rawCode.trim();
  
  // Удаляем все объявления package
  code = code.replace(/^package\s+[^\n]+/gm, '').trim();
  
  // Проверяем наличие fun main
  const hasMain = /^\s*fun\s+main\s*\(/m.test(code);

  if (!hasMain) {
    const lines = code.split('\n');
    const indented = lines.map(line => line.trim() === '' ? '' : `    ${line}`).join('\n');
    return `fun main() {\n${indented}\n}`;
  }
  
  return code;
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
}).on('error', (err) => {
  console.error('🔥 КРИТИЧЕСКАЯ ОШИБКА при запуске:', err);
  process.exit(1);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
  console.error('🔥 КРИТИЧЕСКАЯ ОШИБКА: Необработанное исключение', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 КРИТИЧЕСКАЯ ОШИБКА: Необработанный промис', reason);
  process.exit(1);
});
