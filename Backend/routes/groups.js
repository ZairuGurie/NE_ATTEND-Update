const express = require('express');
const router = express.Router();
const { getModel } = require('../services/dataStore');
const Subject = getModel('Subject');

/**
 * Groups API Route - Backward Compatibility Layer
 * 
 * This route provides backward compatibility for the deprecated Groups system.
 * It returns Subjects formatted as Groups to maintain compatibility with
 * frontend code that still expects the /api/groups endpoint.
 * 
 * Note: Groups have been replaced by Subjects in the system.
 * This endpoint maps Subject data to Group-like structure.
 */

/**
 * Map a Subject document to Group-like structure for backward compatibility
 */
function mapSubjectToGroup(subject) {
  if (!subject) return null;
  
  // Handle both populated and non-populated instructorId
  const instructorId = subject.instructorId?._id || subject.instructorId;
  
  return {
    _id: subject._id,
    id: subject._id,
    // Map subject fields to group-like structure
    groupName: subject.subjectName || subject.subjectCode || 'Untitled',
    subjectName: subject.subjectName,
    subjectCode: subject.subjectCode,
    description: subject.description || '',
    instructorId: instructorId,
    // Include populated instructor data if available
    instructor: subject.instructorId && typeof subject.instructorId === 'object' 
      ? subject.instructorId 
      : undefined,
    sections: subject.sections || [],
    section: subject.sections && subject.sections.length > 0 
      ? subject.sections[0] 
      : null,
    day: subject.day || '',
    time: subject.time || '',
    timeSchedule: subject.time || '',
    room: subject.room || '',
    meetingLink: subject.meetingLink || '',
    department: subject.department || '',
    schoolYear: subject.schoolYear || '',
    semester: subject.semester || '',
    credits: subject.credits || null,
    isActive: subject.isActive !== false,
    // Legacy fields for backward compatibility
    members: [], // Subjects don't have members array (students are assigned via SubjectAssignment)
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
    // Include subjectId for reference
    subjectId: subject._id
  };
}

/**
 * GET /api/groups
 * Get all subjects formatted as groups
 * Supports optional instructorId query parameter to filter by instructor
 */
router.get('/', async (req, res) => {
  try {
    const { instructorId } = req.query;
    
    // Build query
    const query = { isActive: true };
    if (instructorId) {
      query.instructorId = instructorId;
    }
    
    // Fetch subjects with instructor population
    const subjects = await Subject.find(query)
      .populate('instructorId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    // Map subjects to group-like structure
    const groups = subjects.map(mapSubjectToGroup).filter(Boolean);
    
    res.json({
      success: true,
      data: groups,
      count: groups.length,
      message: 'Groups endpoint returns Subjects (Groups are deprecated, use Subjects instead)'
    });
  } catch (error) {
    console.error('Error fetching groups (subjects):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch groups',
      message: error.message
    });
  }
});

/**
 * GET /api/groups/:id
 * Get a specific subject by ID formatted as a group
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const subject = await Subject.findById(id)
      .populate('instructorId', 'firstName lastName email');
    
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
        message: `No subject found with ID: ${id}`
      });
    }
    
    const group = mapSubjectToGroup(subject);
    
    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    console.error('Error fetching group (subject):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group',
      message: error.message
    });
  }
});

/**
 * POST /api/groups
 * Create a new group (subject) - for backward compatibility
 * Note: This should redirect to subjects endpoint, but we'll handle it here
 */
router.post('/', async (req, res) => {
  try {
    // Redirect to subjects endpoint
    res.status(400).json({
      success: false,
      error: 'Groups are deprecated',
      message: 'Please use POST /api/subjects instead. Groups have been replaced by Subjects.'
    });
  } catch (error) {
    console.error('Error in groups POST:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create group',
      message: error.message
    });
  }
});

module.exports = router;

