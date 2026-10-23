// The room line on the County polls and early voting cards (#100).
import { render, screen, waitFor, within } from '@testing-library/react';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import pollRooms from '../../../docs/raw/fixtures/poll-rooms.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import {
  getAbsenteeSites,
  getCityWaits,
  getCountyWaits,
  getPollRooms,
  getPolls,
  getPrecinctGeometry,
} from '../../data/arcgis.js';
import { city } from '../../data/jurisdictions.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import { JurisdictionContext } from './jurisdictionContext.js';
import { nearestPolls } from './nearbyPolls.js';
import PollsCard from './PollsCard.jsx';
import { roomIndex } from './pollRooms.js';
import { createPrecinctMap } from './precinctMapView.js';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({
  getPolls: vi.fn(),
  getAbsenteeSites: vi.fn(),
  getPrecinctGeometry: vi.fn(),
  getPollRooms: vi.fn(),
  getCountyWaits: vi.fn(),
  getCityWaits: vi.fn(),
}));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

const ORIGIN = { lat: 38.66, lng: -90.45 };
const rooms = roomIndex(pollRooms);

beforeEach(() => {
  getPolls.mockReset().mockResolvedValue(polls);
  getAbsenteeSites.mockReset().mockResolvedValue(sites);
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  getPollRooms.mockReset().mockResolvedValue(pollRooms);
  getCountyWaits.mockReset().mockResolvedValue([]);
  getCityWaits.mockReset().mockResolvedValue([]);
  createPrecinctMap.mockReset();
});

const pollsList = () => screen.findByRole('list', { name: copy.polls.listLabel });
const sitesList = () => screen.findByRole('list', { name: copy.earlyVoting.listLabel });
const rows = (ol) => within(ol).getAllByRole('listitem');

describe('the polls card room line', () => {
  it("shows each place's Election Day room, joined on loc, and where rooms come from", async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await pollsList();
    const nearest = nearestPolls(polls, ORIGIN).slice(0, rows(ol).length);
    await waitFor(() =>
      expect(ol).toHaveTextContent(copy.polls.room(rooms.electionDay.get(nearest[0].loc))),
    );
    rows(ol).forEach((row, i) => {
      expect(row).toHaveTextContent(copy.polls.room(rooms.electionDay.get(nearest[i].loc)));
    });
    expect(screen.getByText(copy.polls.roomSource)).toBeInTheDocument();
  });

  it('asks for the rooms together with the polling places, not after them', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(getPolls).toHaveBeenCalledTimes(1);
    expect(getPollRooms).toHaveBeenCalledTimes(1);
  });

  it('shows the list without rooms while the rooms are still loading', async () => {
    getPollRooms.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await pollsList();
    expect(ol).not.toHaveTextContent(copy.polls.room(''));
    expect(screen.queryByText(copy.polls.roomSource)).toBeNull();
  });

  it('shows the places without rooms when the room request fails', async () => {
    getPollRooms.mockRejectedValue(new Error('down'));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await pollsList();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rows(ol).length).toBeGreaterThan(0);
    expect(ol).not.toHaveTextContent(copy.polls.room(''));
    expect(screen.queryByText(copy.polls.roomSource)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no room line for a place with no room row, nor the source line when none has one', async () => {
    getPollRooms.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await pollsList();
    await waitFor(() => expect(getPollRooms).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ol).not.toHaveTextContent(copy.polls.room(''));
    expect(screen.queryByText(copy.polls.roomSource)).toBeNull();
  });
});

describe('the early voting card room line', () => {
  it("shows each site's early voting room, joined on loc_abs", async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    const ol = await sitesList();
    const nearest = nearestPolls(sites, ORIGIN).slice(0, rows(ol).length);
    const withRoom = nearest.filter((s) => rooms.absentee.has(s.absLoc));
    expect(withRoom.length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(ol).toHaveTextContent(copy.polls.room(rooms.absentee.get(withRoom[0].absLoc))),
    );
    rows(ol).forEach((row, i) => {
      const room = rooms.absentee.get(nearest[i].absLoc);
      // The early voting room, never the same place's Election Day room by loc.
      if (room) expect(row).toHaveTextContent(copy.polls.room(room));
      else expect(row).not.toHaveTextContent(copy.polls.room(''));
    });
    expect(screen.getByText(copy.polls.roomSource)).toBeInTheDocument();
  });

  it('shows no room for a site whose room row is empty (Olivette City Center, 614)', async () => {
    const olivette = sites.features.find((f) => f.properties.loc_abs === '614');
    const [lng, lat] = olivette.geometry.coordinates;
    render(<EarlyVotingCard code="CC007" origin={{ lat, lng }} />);
    const ol = await sitesList();
    await waitFor(() => expect(screen.getByText(copy.polls.roomSource)).toBeInTheDocument());
    expect(rows(ol)[0]).not.toHaveTextContent(copy.polls.room(''));
  });

  it('shows the sites without rooms when the room request fails', async () => {
    getPollRooms.mockRejectedValue(new Error('down'));
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    const ol = await sitesList();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ol).not.toHaveTextContent(copy.polls.room(''));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a City page', () => {
  it('asks for no rooms and shows none (#89 has its entrance notes)', async () => {
    const cityRows = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-90.2, 38.63] },
          properties: { loc: '172', name: 'City Site', address: '1 Main St' },
        },
      ],
    };
    const fakeCity = {
      ...city,
      getPolls: () => Promise.resolve(cityRows),
      getOutline: () => Promise.resolve(geometry.features[0]),
    };
    render(
      <JurisdictionContext.Provider value={fakeCity}>
        <PollsCard code="W01P12" origin={ORIGIN} />
      </JurisdictionContext.Provider>,
    );
    const ol = await pollsList();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPollRooms).not.toHaveBeenCalled();
    expect(ol).not.toHaveTextContent(copy.polls.room(''));
  });
});
