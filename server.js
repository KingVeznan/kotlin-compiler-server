import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Ограничиваем размер кода

// Простая защита от спама
const requestCounts = new Map();
const MAX_REQUESTS_PER_HOUR = 100; // 100 запросов в час с одного IP

// Главная страница (для проверки)
app.get('/', (req, res) => {
  res.json({
    message: "Kotlin Compiler Server is running!",
    version: "1.0.0",
    endpoint: "/compile"
  });
});

// Эндпоинт для компиляции кода
app.post('/compile', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  
  // Проверка лимита запросов
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

    // Валидация входных данных
    if (!code) {
      return res.status(400).json({ error: 'Код не предоставлен' });
    }
    
    if (code.length > 5000) {
      return res.status(400).json({ error: 'Код слишком длинный (максимум 5000 символов)' });
    }

    // Исправляем код (добавляем main если нужно)
    const fixedCode = fixKotlinCode(code);

    console.log(`📤 Компиляция запрошена от ${ip}`);
    console.log(`Код (первые 100 символов): ${fixedCode.substring(0, 100)}...`);

    // Отправляем в JDoodle
    const jdoodleResponse = await axios.post(
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

    const result = jdoodleResponse.data;
    console.log(`✅ Компиляция успешна: ${result.statusCode}`);

    res.json({
      success: true,
      output: result.output || 'Нет вывода',
      statusCode: result.statusCode,
      memory: result.memory,
      cpuTime: result.cpuTime
    });

  } catch (error) {
    console.error('❌ Ошибка компиляции:', error.message);

    // Обрабатываем ошибки от JDoodle
    if (error.response) {
      const jdoodleError = error.response.data;
      return res.status(400).json({
        success: false,
        error: jdoodleError.error || 'Ошибка компиляции',
        details: jdoodleError
      });
    }

    // Общие ошибки
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Функция исправления кода (исправленная версия)
function fixKotlinCode(rawCode) {
  let code = rawCode.trim();

  // Шаг 1: Удаляем ВСЕ объявления package (в начале каждой строки)
  code = code.replace(/^package\s+[^\n]+/gm, '').trim();

  // Шаг 2: Удаляем пустые строки в начале и конце
  code = code.replace(/^\s+|\s+$/g, '');

  // Шаг 3: Проверяем, есть ли уже правильная функция main
  // Ищем "fun main" в начале строки (с возможными отступами)
  const hasMain = /^\s*fun\s+main\s*\(/m.test(code);

  if (!hasMain) {
    // Оборачиваем код в fun main()
    // Сохраняем отступы для многострочного кода
    const lines = code.split('\n');
    const indented = lines.map(line => line.trim() === '' ? '' : `    ${line}`).join('\n');
    return `fun main() {\n${indented}\n}`;
  }

  return code;
}
