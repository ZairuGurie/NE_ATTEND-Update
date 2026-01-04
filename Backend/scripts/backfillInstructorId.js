/**
 * Migration Script: Backfill instructorId on Attendance Records
 *
 * This script backfills the instructorId field on legacy Attendance records
 * that don't have instructorId set. It derives the instructorId from the
 * Session -> Subject -> instructorId relationship.
 *
 * Usage:
 *   node Backend/scripts/backfillInstructorId.js
 *
 * Options:
 *   --dry-run    : Preview changes without updating the database
 *   --limit N    : Process only N records (default: all records)
 *   --verbose    : Show detailed progress information
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const { getModel } = require('../services/dataStore')

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')
const limitArg = args.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function connectDatabase () {
  const MONGODB_URI =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/neattend'

  try {
    log(`\n🔌 Connecting to database...`, 'cyan')
    await mongoose.connect(MONGODB_URI)
    log(`✅ Connected to MongoDB`, 'green')
    return true
  } catch (error) {
    log(`❌ Failed to connect to database: ${error.message}`, 'red')
    return false
  }
}

async function backfillInstructorId () {
  const Attendance = getModel('Attendance')
  const _Session = getModel('Session')
  const _Subject = getModel('Subject')

  try {
    log(`\n📊 Analyzing attendance records...`, 'cyan')

    // Find all attendance records with null or missing instructorId
    const query = {
      $or: [{ instructorId: null }, { instructorId: { $exists: false } }]
    }

    const totalRecords = await Attendance.countDocuments(query)
    log(
      `   Found ${totalRecords} attendance records without instructorId`,
      'yellow'
    )

    if (totalRecords === 0) {
      log(
        `\n✅ No records need backfilling. All attendance records already have instructorId.`,
        'green'
      )
      return { updated: 0, skipped: 0, errors: 0 }
    }

    // Apply limit if specified
    const recordsToProcess = limit
      ? Math.min(limit, totalRecords)
      : totalRecords
    log(
      `   Processing ${recordsToProcess} record(s)${
        limit ? ` (limited from ${totalRecords})` : ''
      }...`,
      'yellow'
    )

    // Fetch attendance records with populated session
    const attendanceRecords = await Attendance.find(query)
      .populate({
        path: 'sessionId',
        select: 'subjectId',
        populate: {
          path: 'subjectId',
          select: 'instructorId'
        }
      })
      .limit(recordsToProcess)
      .lean()

    let updated = 0
    let skipped = 0
    let errors = 0
    const errorsList = []

    log(`\n🔄 Processing records...`, 'cyan')

    for (let i = 0; i < attendanceRecords.length; i++) {
      const record = attendanceRecords[i]
      const session = record.sessionId

      if (!session) {
        if (verbose) {
          log(`   ⚠️  Record ${record._id}: No session found`, 'yellow')
        }
        skipped++
        continue
      }

      const subject = session.subjectId

      if (!subject) {
        if (verbose) {
          log(`   ⚠️  Record ${record._id}: Session has no subjectId`, 'yellow')
        }
        skipped++
        continue
      }

      const instructorId = subject.instructorId

      if (!instructorId) {
        if (verbose) {
          log(
            `   ⚠️  Record ${record._id}: Subject has no instructorId`,
            'yellow'
          )
        }
        skipped++
        continue
      }

      // Update the attendance record
      try {
        if (isDryRun) {
          if (verbose || (i + 1) % 10 === 0 || i === 0) {
            log(
              `   [DRY RUN] Would update record ${record._id} with instructorId ${instructorId}`,
              'blue'
            )
          }
        } else {
          await Attendance.updateOne(
            { _id: record._id },
            { $set: { instructorId: instructorId } }
          )

          if (verbose || (i + 1) % 10 === 0 || i === 0) {
            log(
              `   ✅ Updated record ${record._id} with instructorId ${instructorId}`,
              'green'
            )
          }
        }
        updated++
      } catch (error) {
        log(
          `   ❌ Error updating record ${record._id}: ${error.message}`,
          'red'
        )
        errors++
        errorsList.push({ recordId: record._id, error: error.message })
      }

      // Progress indicator
      if ((i + 1) % 50 === 0) {
        log(
          `   Progress: ${i + 1}/${recordsToProcess} records processed...`,
          'cyan'
        )
      }
    }

    // Summary
    log(`\n📈 Migration Summary:`, 'bright')
    log(`   Total records found: ${totalRecords}`, 'cyan')
    log(`   Records processed: ${recordsToProcess}`, 'cyan')
    if (isDryRun) {
      log(`   Would update: ${updated}`, 'blue')
    } else {
      log(`   ✅ Updated: ${updated}`, 'green')
    }
    log(`   ⚠️  Skipped (no session/subject/instructor): ${skipped}`, 'yellow')
    log(`   ❌ Errors: ${errors}`, errors > 0 ? 'red' : 'green')

    if (errors > 0 && verbose) {
      log(`\n❌ Error Details:`, 'red')
      errorsList.forEach(({ recordId, error }) => {
        log(`   Record ${recordId}: ${error}`, 'red')
      })
    }

    if (isDryRun) {
      log(
        `\n💡 This was a dry run. No changes were made to the database.`,
        'blue'
      )
      log(`   Run without --dry-run to apply changes.`, 'blue')
    } else {
      log(`\n✅ Migration completed successfully!`, 'green')
    }

    return { updated, skipped, errors, total: totalRecords }
  } catch (error) {
    log(`\n❌ Fatal error during migration: ${error.message}`, 'red')
    if (verbose) {
      console.error(error)
    }
    throw error
  }
}

async function main () {
  log(`\n${'='.repeat(60)}`, 'bright')
  log(`   Attendance Records - Backfill instructorId Migration`, 'bright')
  log(`${'='.repeat(60)}`, 'bright')

  if (isDryRun) {
    log(`\n🔍 DRY RUN MODE - No changes will be made`, 'blue')
  }

  // Connect to database
  const connected = await connectDatabase()
  if (!connected) {
    process.exit(1)
  }

  try {
    // Run migration
    const result = await backfillInstructorId()

    log(`\n${'='.repeat(60)}`, 'bright')
    process.exit(result.errors > 0 ? 1 : 0)
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, 'red')
    process.exit(1)
  } finally {
    // Close database connection
    await mongoose.connection.close()
    log(`\n🔌 Database connection closed`, 'cyan')
  }
}

// Run migration
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ Unhandled error: ${error.message}`, 'red')
    process.exit(1)
  })
}

module.exports = { backfillInstructorId }
