const express = require('express');
const router = express.Router();
const { getModel } = require('../services/dataStore');
const Announcement = getModel('Announcement');
const User = getModel('User');

// ==================== ANNOUNCEMENTS ====================

// POST /api/announcements - Create announcement
router.post('/announcements', async (req, res) => {
  try {
    const {
      title,
      content,
      instructorId,
      subjectIds,
      groupIds,
      isPinned,
      attachments,
      priority,
      expiresAt,
      targetAudience,
      sections,
      schoolYear,
      yearLevel
    } = req.body;

    if (!title || !content || !instructorId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, content, instructorId'
      });
    }

    const announcement = new Announcement({
      title,
      content,
      instructorId,
      subjectIds: subjectIds || [],
      groupIds: groupIds || [],
      isPinned: isPinned || false,
      attachments: attachments || [],
      priority: priority || 'medium',
      expiresAt: expiresAt || null,
      targetAudience: targetAudience || 'all',
      sections: Array.isArray(sections) ? sections : [],
      schoolYear: schoolYear && schoolYear.trim() ? schoolYear.trim() : null,
      yearLevel: yearLevel && yearLevel.trim() ? yearLevel.trim() : null
    });

    await announcement.save();

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create announcement',
      error: error.message
    });
  }
});

// GET /api/announcements/instructor/:id - Get instructor's announcements
router.get('/announcements/instructor/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { groupId } = req.query;
    const mongoose = require('mongoose');

    console.log(`[Announcements] Request received for instructor: ${instructorId}`);

    // Step 1: Validate instructorId format
    if (!instructorId || typeof instructorId !== 'string') {
      console.error('[Announcements] Invalid instructorId type:', typeof instructorId);
      return res.status(400).json({
        success: false,
        message: 'Invalid instructor ID',
        error: 'instructorId is required and must be a string'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(instructorId)) {
      console.error('[Announcements] Invalid instructorId format:', instructorId);
      return res.status(400).json({
        success: false,
        message: 'Invalid instructor ID format',
        error: 'instructorId must be a valid MongoDB ObjectId'
      });
    }

    // Step 2: Get model
    let AnnouncementModel;
    try {
      AnnouncementModel = getModel('Announcement');
      if (!AnnouncementModel) {
        throw new Error('Model returned null');
      }
      console.log('[Announcements] Model loaded successfully');
    } catch (modelError) {
      console.error('[Announcements] Failed to load model:', modelError);
      return res.status(500).json({
        success: false,
        message: 'Database model not available',
        error: 'Announcement model could not be loaded. Please check database connection.',
        details: modelError.message
      });
    }

    // Step 3: Convert instructorId to ObjectId
    let instructorObjectId;
    try {
      instructorObjectId = new mongoose.Types.ObjectId(instructorId);
      console.log('[Announcements] Instructor ObjectId created:', instructorObjectId.toString());
    } catch (objectIdError) {
      console.error('[Announcements] Failed to create ObjectId:', objectIdError);
      return res.status(400).json({
        success: false,
        message: 'Invalid instructor ID',
        error: 'Could not convert instructorId to ObjectId'
      });
    }

    // Step 4: Build simple filter - just by instructorId first
    const filter = { instructorId: instructorObjectId };

    // Add groupId if provided
    if (groupId) {
      if (mongoose.Types.ObjectId.isValid(groupId)) {
        filter.groupIds = new mongoose.Types.ObjectId(groupId);
        console.log('[Announcements] Added groupId filter:', groupId);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid group ID format',
          error: 'groupId must be a valid MongoDB ObjectId'
        });
      }
    }

    console.log('[Announcements] Query filter:', JSON.stringify(filter));

    // Step 5: Execute query - try without populate first, then add populate if needed
    let announcements;
    try {
      // First, try a basic query without populate to ensure the query itself works
      console.log('[Announcements] Executing basic query without populate...');
      const basicQuery = AnnouncementModel.find(filter);
      const basicResults = await basicQuery.lean().exec();
      console.log(`[Announcements] Basic query successful, found ${basicResults.length} results`);
      
      // Now try to populate if we have results (make it optional to avoid errors)
      if (basicResults.length > 0) {
        console.log('[Announcements] Attempting to populate references...');
        try {
          // Re-query with populate, but make it non-strict
          const populatedQuery = AnnouncementModel.find(filter)
            .populate({
              path: 'groupIds',
              select: 'groupName section',
              strictPopulate: false
            })
            .populate({
              path: 'instructorId',
              select: 'firstName lastName',
              strictPopulate: false
            });
          
          const populatedResults = await populatedQuery.lean().exec();
          announcements = populatedResults;
          console.log('[Announcements] Populate successful');
        } catch (populateError) {
          console.warn('[Announcements] Populate failed, using basic results:', populateError.message);
          // If populate fails, just use the basic results and sort manually
          announcements = basicResults;
        }
      } else {
        announcements = basicResults;
      }
      
      // Sort announcements manually (pinned first, then by date)
      announcements.sort((a, b) => {
        // Pinned items first
        if (a.isPinned !== b.isPinned) {
          return b.isPinned ? 1 : -1;
        }
        // Then by creation date (newest first)
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      });
      
      console.log(`[Announcements] Final result count: ${announcements.length}`);
    } catch (queryError) {
      console.error('[Announcements] Query failed:', queryError);
      console.error('[Announcements] Error name:', queryError.name);
      console.error('[Announcements] Error message:', queryError.message);
      console.error('[Announcements] Query error stack:', queryError.stack);
      
      // Provide more specific error information
      let errorMessage = queryError.message || 'Database query failed';
      if (queryError.name === 'CastError') {
        errorMessage = `Invalid data format: ${queryError.path || 'unknown field'}`;
      } else if (queryError.message && queryError.message.includes('connection')) {
        errorMessage = 'Database connection error. Please check if MongoDB is running.';
      } else if (queryError.message && queryError.message.includes('timeout')) {
        errorMessage = 'Database query timeout. Please try again.';
      }
      
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: errorMessage,
        errorType: queryError.name,
        details: process.env.NODE_ENV === 'development' ? {
          name: queryError.name,
          message: queryError.message,
          stack: queryError.stack,
          path: queryError.path,
          value: queryError.value
        } : undefined
      });
    }

    // Step 6: Filter expired announcements in JavaScript (simpler and more reliable)
    const now = new Date();
    const validAnnouncements = announcements.filter(announcement => {
      if (!announcement.expiresAt) {
        return true; // No expiration date, always valid
      }
      const expiresAt = new Date(announcement.expiresAt);
      return expiresAt > now; // Only include if not expired
    });

    console.log(`[Announcements] After filtering expired: ${validAnnouncements.length} valid announcements`);

    // Step 7: Return results
    res.json({
      success: true,
      data: validAnnouncements || []
    });
  } catch (error) {
    console.error('[Announcements] Unexpected error:', error);
    console.error('[Announcements] Error name:', error.name);
    console.error('[Announcements] Error message:', error.message);
    console.error('[Announcements] Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements',
      error: error.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// GET /api/announcements/student/:studentId - Get announcements for student
router.get('/announcements/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { groupId } = req.query;

    // Fetch student information
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const studentSection = student.section ? student.section.trim().toLowerCase() : null;
    const studentSchoolYear = student.schoolYear ? student.schoolYear.trim() : null;
    const studentYearLevel = student.yearLevel ? student.yearLevel.trim() : null;

    // Build filter for non-expired announcements
    const filter = {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    };

    if (groupId) {
      // If groupId is specified, filter by that group
      filter.groupIds = groupId;
    }

    // Fetch all non-expired announcements (we'll filter by targeting criteria in code)
    const announcements = await Announcement.find(filter)
      .populate('instructorId', 'firstName lastName')
      .populate('groupIds', 'subjectName section')
      .sort({ isPinned: -1, createdAt: -1 });

    // Filter announcements based on student's profile matching announcement targeting criteria
    const filteredAnnouncements = announcements.filter(announcement => {
      // Check section match
      const announcementSections = announcement.sections && Array.isArray(announcement.sections) 
        ? announcement.sections.map(s => s.trim().toLowerCase()) 
        : [];
      
      // If announcement has sections, student must be in one of those sections
      if (announcementSections.length > 0) {
        if (!studentSection || !announcementSections.includes(studentSection)) {
          return false;
        }
      }

      // Check school year match (empty/null means all school years)
      if (announcement.schoolYear && announcement.schoolYear.trim()) {
        if (!studentSchoolYear || announcement.schoolYear.trim() !== studentSchoolYear) {
          return false;
        }
      }

      // Check year level match (empty/null means all year levels)
      if (announcement.yearLevel && announcement.yearLevel.trim()) {
        if (!studentYearLevel || announcement.yearLevel.trim() !== studentYearLevel) {
          return false;
        }
      }

      return true;
    });

    // Add read status for each announcement
    const announcementsWithStatus = filteredAnnouncements.map(announcement => {
      const isRead = announcement.readBy && announcement.readBy.some(
        read => read.userId && read.userId.toString() === studentId
      );
      
      return {
        ...announcement.toObject(),
        isRead: !!isRead
      };
    });

    res.json({
      success: true,
      data: announcementsWithStatus
    });
  } catch (error) {
    console.error('Error fetching student announcements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements',
      error: error.message
    });
  }
});

// GET /api/announcements/:id - Get single announcement
router.get('/announcements/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email')
      .populate('groupIds', 'subjectName section');

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcement',
      error: error.message
    });
  }
});

// PUT /api/announcements/:id/read - Mark announcement as read
router.put('/announcements/:id/read', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Check if already marked as read
    const alreadyRead = announcement.readBy.some(
      read => read.userId.toString() === userId
    );

    if (!alreadyRead) {
      announcement.readBy.push({
        userId,
        readAt: new Date()
      });
      await announcement.save();
    }

    res.json({
      success: true,
      message: 'Announcement marked as read'
    });
  } catch (error) {
    console.error('Error marking announcement as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark announcement as read',
      error: error.message
    });
  }
});

// PUT /api/announcements/:id - Update announcement
router.put('/announcements/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update announcement',
      error: error.message
    });
  }
});

// DELETE /api/announcements/:id - Delete announcement
router.delete('/announcements/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement',
      error: error.message
    });
  }
});

module.exports = router;

