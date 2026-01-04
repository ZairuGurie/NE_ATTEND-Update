/**
 * DiagnosticPanel Component
 * Compact, floating diagnostic panel for system status monitoring
 */

import React, { useState } from 'react'
import { brand, neutral, status as statusColors } from '../../utils/colors'
// Phase 4: CSS classes for theme-aware styling
import '../../styles/common.css'

const StatusDot = ({ active, size = 8 }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: active
        ? statusColors.present.border
        : statusColors.absent.border,
      display: 'inline-block',
      boxShadow: active ? `0 0 6px ${statusColors.present.border}` : 'none'
    }}
  />
)

const StatusBadge = ({ icon, label, value, status = 'neutral', detail }) => {
  const colors = {
    success: {
      bg: statusColors.present.bg,
      text: statusColors.present.text,
      border: statusColors.present.border
    },
    warning: {
      bg: statusColors.late.bg,
      text: statusColors.late.text,
      border: statusColors.late.border
    },
    error: {
      bg: statusColors.absent.bg,
      text: statusColors.absent.text,
      border: statusColors.absent.border
    },
    neutral: {
      bg: neutral.bgMuted,
      text: neutral.textSecondary,
      border: neutral.border
    }
  }
  const c = colors[status] || colors.neutral

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: c.bg,
        borderRadius: 6,
        borderLeft: `3px solid ${c.border}`,
        minWidth: 0
      }}
      title={detail}
    >
      <i
        className={icon}
        style={{ fontSize: 12, color: c.text, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            color: neutral.textMuted,
            whiteSpace: 'nowrap'
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: c.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

const DiagnosticPanel = ({
  socketRef,
  roomsJoined = [],
  roomStatusFromBackend,
  allowedIdsLoaded,
  allowedSubjectIds = [],
  allowedGroupIds = [],
  extensionConnected,
  extensionActivityFromBackend,
  lastUpdateReceived,
  meetingStatus,
  meetingDebugInfo,
  realtimeSource,
  updateQueueRef
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  const socketConnected = socketRef?.current?.connected ?? false
  const backendRooms = roomStatusFromBackend
    ? [
        ...(roomStatusFromBackend.subjectRooms || []),
        ...(roomStatusFromBackend.groupRooms || [])
      ]
    : []
  const displayRooms = backendRooms.length > 0 ? backendRooms : roomsJoined
  const extensionActive =
    (extensionActivityFromBackend?.isActive ?? false) || extensionConnected
  const queueLength = updateQueueRef?.current?.length || 0
  const inferredBackendStatus = meetingDebugInfo?.inferredMeetingStatus || null
  const backendAgeSeconds = meetingDebugInfo?.liveCacheAgeSeconds ?? null
  const backendMeetCode = meetingDebugInfo?.meetCode || null
  const backendParticipantCount = meetingDebugInfo?.liveParticipantCount ?? null
  const backendLivePhase = meetingDebugInfo?.liveLifecyclePhase || null
  const backendInferredPhase = meetingDebugInfo?.inferredLifecyclePhase || null
  const currentSource = realtimeSource || 'unknown'
  const overallStatus =
    socketConnected && extensionActive
      ? 'success'
      : socketConnected
      ? 'warning'
      : 'error'

  if (isMinimized) {
    return (
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
        <button
          onClick={() => setIsMinimized(false)}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: brand.primary,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            position: 'relative'
          }}
          title='Show Diagnostics'
        >
          <i
            className='bi-activity'
            style={{ fontSize: 20, color: neutral.bgSurface }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background:
                overallStatus === 'success'
                  ? statusColors.present.border
                  : overallStatus === 'warning'
                  ? statusColors.late.border
                  : statusColors.absent.border,
              border: `2px solid ${neutral.bgSurface}`
            }}
          />
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1000,
        width: isExpanded ? 360 : 260,
        maxHeight: isExpanded ? '60vh' : 'auto',
        background: neutral.bgSurface,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: `1px solid ${neutral.borderLight}`,
        overflow: 'hidden',
        transition: 'all 0.25s ease'
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          background: brand.primary,
          color: neutral.bgSurface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className='bi-activity' style={{ fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>System Status</span>
          <StatusDot active={overallStatus === 'success'} size={8} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={e => {
              e.stopPropagation()
              setIsMinimized(true)
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: neutral.bgSurface,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title='Minimize'
          >
            <i className='bi-dash' style={{ fontSize: 12 }} />
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: neutral.bgSurface,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <i
              className={isExpanded ? 'bi-chevron-down' : 'bi-chevron-up'}
              style={{ fontSize: 10 }}
            />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: '6px 10px',
          display: 'flex',
          gap: 4,
          borderBottom: isExpanded
            ? `1px solid ${neutral.borderLight}`
            : 'none',
          background: neutral.bgMuted
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 6px',
            background: socketConnected
              ? statusColors.present.bg
              : statusColors.absent.bg,
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color: socketConnected
              ? statusColors.present.text
              : statusColors.absent.text
          }}
        >
          <StatusDot active={socketConnected} size={6} />
          Socket
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 6px',
            background: extensionActive
              ? statusColors.present.bg
              : statusColors.absent.bg,
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color: extensionActive
              ? statusColors.present.text
              : statusColors.absent.text
          }}
        >
          <StatusDot active={extensionActive} size={6} />
          Ext
        </div>
        <div
          style={{
            padding: '3px 6px',
            background:
              displayRooms.length > 0
                ? statusColors.present.bg
                : statusColors.late.bg,
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color:
              displayRooms.length > 0
                ? statusColors.present.text
                : statusColors.late.text
          }}
        >
          {displayRooms.length} rm
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 'calc(60vh - 90px)',
            overflowY: 'auto'
          }}
        >
          <StatusBadge
            icon='bi-plug'
            label='Socket.IO'
            value={
              socketConnected
                ? `${socketRef?.current?.id?.slice(0, 10) || 'N/A'}...`
                : 'Disconnected'
            }
            status={socketConnected ? 'success' : 'error'}
            detail={`Socket ID: ${socketRef?.current?.id || 'N/A'}`}
          />
          <StatusBadge
            icon='bi-door-open'
            label={`Rooms (${roomStatusFromBackend ? 'Backend' : 'State'})`}
            value={
              displayRooms.length > 0 ? `${displayRooms.length} active` : 'None'
            }
            status={displayRooms.length > 0 ? 'success' : 'warning'}
            detail={displayRooms.join(', ')}
          />
          {displayRooms.length > 0 && (
            <div
              style={{
                padding: 6,
                background: neutral.bgMuted,
                borderRadius: 4,
                fontSize: 9,
                color: neutral.textMuted,
                maxHeight: 60,
                overflowY: 'auto',
                fontFamily: 'monospace'
              }}
            >
              {displayRooms.map((room, idx) => (
                <div key={idx} style={{ padding: '1px 0' }}>
                  • {room.length > 30 ? `${room.slice(0, 30)}...` : room}
                </div>
              ))}
            </div>
          )}
          <StatusBadge
            icon='bi-key'
            label='Allowed IDs'
            value={
              allowedIdsLoaded
                ? `${allowedSubjectIds.length}S / ${allowedGroupIds.length}G`
                : 'Loading...'
            }
            status={allowedIdsLoaded ? 'success' : 'warning'}
          />
          {meetingDebugInfo && (
            <StatusBadge
              icon='bi-people'
              label='Meeting'
              value={inferredBackendStatus || meetingStatus || 'Unknown'}
              status={
                inferredBackendStatus === 'active' ||
                inferredBackendStatus === 'data_received'
                  ? 'success'
                  : inferredBackendStatus === 'scraping'
                  ? 'warning'
                  : inferredBackendStatus === 'paused'
                  ? 'neutral'
                  : 'neutral'
              }
              detail={`Code: ${backendMeetCode || 'n/a'} | Live: ${
                backendParticipantCount ?? 'n/a'
              } | Age: ${
                backendAgeSeconds != null ? `${backendAgeSeconds}s` : 'n/a'
              }`}
            />
          )}
          <StatusBadge
            icon='bi-broadcast'
            label='Source'
            value={currentSource}
            status='neutral'
            detail='Current primary realtime data source'
          />
          {meetingDebugInfo && (
            <StatusBadge
              icon='bi-diagram-3'
              label='Lifecycle'
              value={backendLivePhase || backendInferredPhase || 'Unknown'}
              status='neutral'
              detail={`Live phase: ${
                backendLivePhase || 'n/a'
              } | Inferred phase: ${backendInferredPhase || 'n/a'}`}
            />
          )}
          <StatusBadge
            icon='bi-puzzle'
            label='Extension'
            value={extensionActive ? 'Active' : 'Inactive'}
            status={extensionActive ? 'success' : 'neutral'}
            detail={
              extensionActivityFromBackend?.meetCode
                ? `Meet: ${extensionActivityFromBackend.meetCode}`
                : undefined
            }
          />
          <StatusBadge
            icon='bi-clock'
            label='Last Update'
            value={
              lastUpdateReceived
                ? `${Math.round(
                    (Date.now() - lastUpdateReceived.getTime()) / 1000
                  )}s ago`
                : 'Never'
            }
            status={lastUpdateReceived ? 'success' : 'neutral'}
          />
          <StatusBadge
            icon='bi-inbox'
            label='Queue'
            value={`${queueLength} pending`}
            status={queueLength > 0 ? 'warning' : 'success'}
          />
        </div>
      )}
    </div>
  )
}

export default DiagnosticPanel
