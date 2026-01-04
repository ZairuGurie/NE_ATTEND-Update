const express = require('express');
const router = express.Router();
const { getModel } = require('../services/dataStore');
const { requireAuth } = require('../middleware/auth');
const Note = getModel('Note');
const User = getModel('User');

// Middleware to populate req.user from req.auth
const populateUser = async (req, res, next) => {
  try {
    if (req.auth && req.auth.userId) {
      const user = await User.findById(req.auth.userId).select('-userPassword');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = user;
    }
    next();
  } catch (error) {
    console.error('Error populating user:', error);
    return res.status(401).json({ error: 'Invalid token', details: error.message });
  }
};

// GET /api/notes - Get all notes for the authenticated user
router.get('/', requireAuth, populateUser, async (req, res) => {
  try {
    console.log('Fetching notes for user:', req.user._id, 'role:', req.user.role);
    
    const notes = await Note.find({ userId: req.user._id })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    console.log(`Found ${notes.length} notes for user ${req.user._id}`);
    
    res.json({
      success: true,
      data: notes,
      count: notes.length
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notes',
      message: error.message
    });
  }
});

// POST /api/notes - Create a new note
router.post('/', requireAuth, populateUser, async (req, res) => {
  try {
    const { topic, description, subject } = req.body;

    // Validate required fields
    if (!topic || !description || !subject) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required',
        message: 'Please fill in Topic, Description, and Subject.'
      });
    }

    // Create new note with automatic date
    const note = new Note({
      topic: topic.trim(),
      description: description.trim(),
      subject: subject.trim(),
      date: new Date(), // Automatically set current date
      userId: req.user._id,
      userRole: req.user.role
    });

    await note.save();

    res.status(201).json({
      success: true,
      message: 'Note created successfully',
      data: note
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create note',
      message: error.message
    });
  }
});

// PUT /api/notes/:id - Update a note
router.put('/:id', requireAuth, populateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, description, subject } = req.body;

    // Validate required fields
    if (!topic || !description || !subject) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required',
        message: 'Please fill in Topic, Description, and Subject.'
      });
    }

    // Find and update note (only if it belongs to the user)
    const note = await Note.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        topic: topic.trim(),
        description: description.trim(),
        subject: subject.trim()
        // date is not updated - keeps original creation date
      },
      { new: true, runValidators: true }
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        message: 'Note not found or you do not have permission to update it'
      });
    }

    res.json({
      success: true,
      message: 'Note updated successfully',
      data: note
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update note',
      message: error.message
    });
  }
});

// DELETE /api/notes/:id - Delete a note
router.delete('/:id', requireAuth, populateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete note (only if it belongs to the user)
    const note = await Note.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        message: 'Note not found or you do not have permission to delete it'
      });
    }

    res.json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete note',
      message: error.message
    });
  }
});

// GET /api/notes/:id - Get a specific note
router.get('/:id', requireAuth, populateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const note = await Note.findOne({ _id: id, userId: req.user._id }).lean();

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
        message: 'Note not found or you do not have permission to view it'
      });
    }

    res.json({
      success: true,
      data: note
    });
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch note',
      message: error.message
    });
  }
});

module.exports = router;
