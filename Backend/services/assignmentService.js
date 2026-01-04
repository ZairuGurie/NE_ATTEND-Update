/**
 * Assignment Service
 * Handles automatic student assignment to subjects and groups based on section matching
 */

const { getModel } = require('./dataStore');
const User = getModel('User');
const Subject = getModel('Subject');

/**
 * Normalize section string for case-insensitive matching
 * @param {string} section - Section string to normalize
 * @returns {string} - Normalized section (lowercase, trimmed)
 */
function normalizeSection(section) {
  if (!section || typeof section !== 'string') return '';
  return section.trim().toLowerCase();
}

/**
 * Check if student section matches any subject sections
 * @param {string} studentSection - Student's section
 * @param {Array} subjectSections - Subject's sections array
 * @returns {boolean} - True if matches
 */
function sectionMatches(studentSection, subjectSections) {
  const normalizedStudentSection = normalizeSection(studentSection);
  if (!normalizedStudentSection) return false;
  
  if (!Array.isArray(subjectSections) || subjectSections.length === 0) return false;
  
  return subjectSections.some(subjectSection => 
    normalizeSection(subjectSection) === normalizedStudentSection
  );
}

/**
 * Assign a newly created student to all matching subjects and groups
 * Called after student account creation
 * @param {string} studentId - Student user ID
 * @param {string} studentSection - Student's section
 * @returns {Promise<Object>} - Assignment summary
 */
async function assignNewStudentToMatchingSubjects(studentId, studentSection) {
  const summary = {
      studentId,
      section: studentSection,
      subjectsMatched: 0,
      errors: []
    };

  try {
    const normalizedStudentSection = normalizeSection(studentSection);
    if (!normalizedStudentSection) {
      console.log(`⚠️  Student ${studentId} has no section, skipping auto-assignment`);
      return summary;
    }

    // Find all active subjects where sections include this student's section
    const matchingSubjects = await Subject.find({
      isActive: true,
      sections: { $in: [normalizedStudentSection, studentSection] } // Check both normalized and original for compatibility
    });

    summary.subjectsMatched = matchingSubjects.length;
    console.log(`📚 Found ${matchingSubjects.length} matching subject(s) for student ${studentId} (section: ${studentSection})`);

    // Subjects don't have explicit members - students are matched by section automatically
    // No assignment needed, just count matching subjects

    console.log(`✅ Auto-assignment complete for student ${studentId}: ${summary.subjectsMatched} subject(s) matched`);
    return summary;
  } catch (error) {
    const errorMsg = `Auto-assignment failed for student ${studentId}: ${error.message}`;
    summary.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return summary;
  }
}

/**
 * Assign all matching students to a subject's groups
 * Called after subject creation
 * @param {string} subjectId - Subject ID
 * @returns {Promise<Object>} - Assignment summary
 */
async function assignStudentsToSubjectBySection(subjectId) {
  const summary = {
    subjectId,
    studentsMatched: 0,
    errors: []
  };

  try {
    const subject = await Subject.findById(subjectId);
    if (!subject || !subject.isActive) {
      summary.errors.push('Subject not found or inactive');
      return summary;
    }

    if (!Array.isArray(subject.sections) || subject.sections.length === 0) {
      console.log(`⚠️  Subject ${subjectId} has no sections, skipping auto-assignment`);
      return summary;
    }

    // Find all students whose section matches any of the subject's sections
    const normalizedSections = subject.sections.map(s => normalizeSection(s));
    const matchingStudents = await User.find({
      role: 'student',
      active: { $ne: false }, // Include active and undefined
      $or: [
        { section: { $in: subject.sections } }, // Original sections
        { section: { $in: normalizedSections } } // Normalized sections
      ]
    });

    summary.studentsMatched = matchingStudents.length;
    console.log(`👥 Found ${matchingStudents.length} matching student(s) for subject ${subjectId}`);

    // Subjects don't have explicit members - students are matched by section automatically
    // No assignment needed, just return summary
    console.log(`✅ Auto-assignment complete for subject ${subjectId}: ${matchingStudents.length} student(s) matched by section`);
    return summary;
  } catch (error) {
    const errorMsg = `Auto-assignment failed for subject ${subjectId}: ${error.message}`;
    summary.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return summary;
  }
}

/**
 * Assign all matching students to a group (DEPRECATED - Groups removed)
 * This function is kept for backward compatibility but does nothing
 * @param {string} groupId - Group ID (ignored)
 * @returns {Promise<Object>} - Empty assignment summary
 */
async function assignStudentsToGroupBySection(groupId) {
  console.warn('⚠️  assignStudentsToGroupBySection is deprecated - Groups have been removed. Use subjects instead.');
  return {
    groupId,
    studentsMatched: 0,
    studentsAssigned: 0,
    errors: ['Groups have been removed - use subjects instead']
  };
}

module.exports = {
  assignNewStudentToMatchingSubjects,
  assignStudentsToSubjectBySection,
  assignStudentsToGroupBySection,
  normalizeSection,
  sectionMatches
};

