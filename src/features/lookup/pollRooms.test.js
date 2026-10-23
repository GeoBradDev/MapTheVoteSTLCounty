import pollRooms from '../../../docs/raw/fixtures/poll-rooms.json';
import { roomCase, roomIndex } from './pollRooms.js';

const row = (LOCATION_ID, ACTIVE, ACTIVE_ROOM) => ({
  type: 'Feature',
  geometry: null,
  properties: { LOCATION_ID, ACTIVE, ACTIVE_ROOM },
});

describe('roomCase', () => {
  it.each([
    ['GYM LOBBY', 'Gym Lobby'],
    ['MEETING ROOM 1', 'Meeting Room 1'],
    ['PERFORMING ARTS CENTER', 'Performing Arts Center'],
    ['BOARD OF ALDERMEN CHAMBERS', 'Board of Aldermen Chambers'],
    ['GYM A', 'Gym A'],
    ['EVENT SPACE A + B', 'Event Space A + B'],
    ['COMMUNITY ROOM A & B', 'Community Room A & B'],
    ['MEETING ROOM A&B', 'Meeting Room A&B'],
    ['MEETING ROOM A+B+C', 'Meeting Room A+B+C'],
    ['MILLENNIUM ROOM "B+C"', 'Millennium Room "B+C"'],
    ['MULTIPURPOSE ROOM AB', 'Multipurpose Room AB'],
    ['MP1/MP2 ROOMS', 'MP1/MP2 Rooms'],
    ['ROOM HS109A', 'Room HS109A'],
    ['RM 140 GYM', 'RM 140 Gym'],
    ['2ND FLOOR MEETING ROOM', '2nd Floor Meeting Room'],
    ['FOYER (CHURCH ENTRANCE)', 'Foyer (Church Entrance)'],
    ['MEETING ROOM (LOWER LEVEL)', 'Meeting Room (Lower Level)'],
    ['FOYER/HALLWAY', 'Foyer/Hallway'],
    ['CO-WORKING SPACE', 'Co-Working Space'],
    ['GYM (room 300)', 'Gym (Room 300)'],
    ['VFW BANQUET ROOM', 'VFW Banquet Room'],
    ['THE GRUB HUB', 'The Grub Hub'],
    ['  MULTIPURPOSE ROOM ', 'Multipurpose Room'],
    ['LOBBY BY ELEVATOR', 'Lobby by Elevator'],
    ['GYM OR CAFETERIA', 'Gym or Cafeteria'],
    ['UP STAIRS', 'Up Stairs'],
  ])('cases %j as %j', (text, expected) => {
    expect(roomCase(text)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], [7]])('is null for %j', (text) => {
    expect(roomCase(text)).toBeNull();
  });
});

describe('roomIndex', () => {
  it('keys Election Day rooms by the polls layer loc, zero-padded', () => {
    const { electionDay, absentee } = roomIndex({
      features: [row(172, 'ACTIVE', 'MEETING ROOM 1'), row(7, 'ACTIVE', 'GYM LOBBY')],
    });
    expect(electionDay.get('172')).toBe('Meeting Room 1');
    expect(electionDay.get('007')).toBe('Gym Lobby');
    expect(absentee.size).toBe(0);
  });

  it('keys early voting rooms by the polls layer loc_abs', () => {
    const { electionDay, absentee } = roomIndex({
      features: [row(603, 'ABSENTEE', 'EVENT SPACE A + B')],
    });
    expect(absentee.get('603')).toBe('Event Space A + B');
    expect(electionDay.size).toBe(0);
  });

  it('has no room for a location with no row', () => {
    const { electionDay } = roomIndex({ features: [row(1, 'ACTIVE', 'GYM')] });
    expect(electionDay.get('002')).toBeUndefined();
  });

  it.each([[null], [''], ['  ']])('leaves out an empty room (%j)', (room) => {
    const { absentee } = roomIndex({ features: [row(614, 'ABSENTEE', room)] });
    expect(absentee.has('614')).toBe(false);
  });

  it('leaves out a location whose rows name different rooms', () => {
    const { electionDay } = roomIndex({
      features: [row(5, 'ACTIVE', 'GYM'), row(5, 'ACTIVE', 'LIBRARY'), row(6, 'ACTIVE', 'GYM')],
    });
    expect(electionDay.has('005')).toBe(false);
    expect(electionDay.get('006')).toBe('Gym');
  });

  it('keeps a location whose rows agree', () => {
    const { electionDay } = roomIndex({
      features: [row(5, 'ACTIVE', 'GYM'), row(5, 'ACTIVE', 'GYM ')],
    });
    expect(electionDay.get('005')).toBe('Gym');
  });

  it('skips rows of another kind, a bad location number or no properties', () => {
    const { electionDay, absentee } = roomIndex({
      features: [
        row(9, 'INACTIVE', 'GYM'),
        row('x', 'ACTIVE', 'GYM'),
        row(1.5, 'ACTIVE', 'GYM'),
        row(null, 'ABSENTEE', 'GYM'),
        { type: 'Feature', geometry: null, properties: null },
        null,
      ],
    });
    expect(electionDay.size + absentee.size).toBe(0);
  });

  it('reads a numeric string location number', () => {
    expect(roomIndex({ features: [row('42', 'ACTIVE', 'GYM')] }).electionDay.get('042')).toBe(
      'Gym',
    );
  });

  it('is empty for no collection', () => {
    const { electionDay, absentee } = roomIndex(undefined);
    expect(electionDay.size + absentee.size).toBe(0);
  });

  it('indexes the recorded layer: a room for every Election Day place', () => {
    const { electionDay, absentee } = roomIndex(pollRooms);
    expect(electionDay.size).toBe(200);
    expect(electionDay.get('172')).toBe('Meeting Room 1');
    expect(electionDay.get('082')).toBe('Gym Lobby');
    expect(absentee.get('603')).toBe('Event Space A + B');
    // Olivette City Center's early voting row has no room on 2026-10-23.
    expect(absentee.has('614')).toBe(false);
  });
});
