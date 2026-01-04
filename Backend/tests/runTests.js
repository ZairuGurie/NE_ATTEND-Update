/**
 * Simple test runner for the NE-Attend backend tests
 *
 * This provides a basic testing framework when Jest is not available.
 * For production use, consider installing Jest or Mocha.
 */

const fs = require('fs')
const path = require('path')

// Ensure test environment configuration is set before any models are loaded
if (!process.env.TEST_MONGODB_URI) {
  process.env.TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/neattend_test'
}
if (!process.env.LOCAL_MONGODB_URI) {
  process.env.LOCAL_MONGODB_URI = process.env.TEST_MONGODB_URI
}
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

// Simple scheduler to run tests sequentially
let lastTestPromise = Promise.resolve()

// Mock global test functions
global.describe = (name, fn) => {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`🧪 ${name}`)
  console.log(`${'='.repeat(50)}`)
  fn()
}

global.it = (name, fn) => {
  const runTest = async () => {
    try {
      if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') {
        await fn()
      } else if (typeof fn === 'function') {
        fn()
      }
      console.log(`✅ ${name}`)
    } catch (error) {
      console.log(`❌ ${name}`)
      console.log(`   Error: ${error.message}`)
      if (error.stack) {
        console.log(
          `   Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`
        )
      }
    }
  }

  // Chain tests so they execute sequentially in declaration order
  lastTestPromise = lastTestPromise.then(() => runTest())
}

global.beforeEach = fn => {
  // Store for potential future use
  global._beforeEachFn = fn
}

global.afterEach = fn => {
  // Store for potential future use
  global._afterEachFn = fn
}

global.beforeAll = fn => {
  // Store for potential future use
  global._beforeAllFn = fn
}

global.afterAll = fn => {
  // Store for potential future use
  global._afterAllFn = fn
}

global.expect = actual => ({
  toBe: expected => {
    if (actual !== expected) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  },
  toEqual: expected => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected null, got ${JSON.stringify(actual)}`)
    }
  },
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error('Expected value to be defined')
    }
  },
  toThrow: expectedMessage => {
    try {
      actual()
      throw new Error('Expected function to throw')
    } catch (error) {
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", got "${error.message}"`
        )
      }
    }
  },
  toBeGreaterThanOrEqual: expected => {
    if (actual < expected) {
      throw new Error(`Expected ${actual} to be >= ${expected}`)
    }
  },
  toBeLessThan: expected => {
    if (actual >= expected) {
      throw new Error(`Expected ${actual} to be < ${expected}`)
    }
  },
  not: {
    toBe: expected => {
      if (actual === expected) {
        throw new Error(`Expected not to be ${JSON.stringify(expected)}`)
      }
    }
  },
  rejects: {
    toThrow: async () => {
      try {
        await actual
        throw new Error('Expected promise to reject')
      } catch {
        // Expected to throw
      }
    }
  }
})

// Function to recursively find test files
function findTestFiles (dir) {
  const testFiles = []
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      testFiles.push(...findTestFiles(filePath))
    } else if (file.endsWith('.test.js')) {
      testFiles.push(filePath)
    }
  }

  return testFiles
}

// Main test runner
async function runTests () {
  console.log('🚀 Starting NE-Attend Backend Tests')
  console.log('=====================================\n')

  const testDir = path.join(__dirname)
  const testFiles = findTestFiles(testDir)

  if (testFiles.length === 0) {
    console.log('❌ No test files found')
    return
  }

  console.log(`📁 Found ${testFiles.length} test files:\n`)
  testFiles.forEach(file => {
    console.log(`   - ${path.relative(testDir, file)}`)
  })
  console.log('')

  let totalTests = 0
  let passedTests = 0
  let failedTests = 0

  // Override console.log to count tests
  const originalLog = console.log
  console.log = (...args) => {
    const message = args.join(' ')
    if (message.startsWith('✅')) {
      passedTests++
      totalTests++
    } else if (message.startsWith('❌')) {
      failedTests++
      totalTests++
    }
    originalLog(...args)
  }

  // Run each test file
  for (const testFile of testFiles) {
    try {
      console.log(`\n📄 Running ${path.relative(testDir, testFile)}`)
      require(testFile)
    } catch (error) {
      console.log(`❌ Failed to load test file: ${testFile}`)
      console.log(`   Error: ${error.message}`)
      failedTests++
      totalTests++
    }
  }

  // Wait for all queued tests to complete deterministically
  await lastTestPromise

  // Restore console.log
  console.log = originalLog

  // Print summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Test Summary')
  console.log('='.repeat(50))
  console.log(`Total Tests: ${totalTests}`)
  console.log(`✅ Passed: ${passedTests}`)
  console.log(`❌ Failed: ${failedTests}`)

  // Attempt to close any active Mongoose connections used by the app
  try {
    const {
      getCloudConnection,
      getLocalConnection
    } = require('../db/connectionManager')
    const cloud = getCloudConnection()
    const local = getLocalConnection()

    if (cloud && typeof cloud.close === 'function') {
      await cloud.close()
    }
    if (local && typeof local.close === 'function' && local !== cloud) {
      await local.close()
    }
  } catch (err) {
    console.log('⚠️  Failed to close MongoDB connections cleanly:', err.message)
  }

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log(`\n⚠️  ${failedTests} test(s) failed`)
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}

module.exports = { runTests }
