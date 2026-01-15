/**
 * HubSpot Custom Coded Action: Create and log a Meeting Engagement for a Deal (using workflow inputs)
 * Also associates all Contacts linked to the Deal to the created Meeting.
 *
 * @param {any} event - HubSpot workflow context (runs in Deal-based workflow)
 * @param {Function} callback - Function to return results back to HubSpot
 *    Input fields:
 *      - hs_object_id: The Deal's record ID
 *      - deal_name: The Deal's name
 *      - deal_owner_id: The Deal owner's User ID
 */
const axios = require('axios');

exports.main = async (event, callback) => {
  let success = false;
  let error_message = "";

  try {
    // Retrieve Deal's record ID, name, and owner from workflow input fields
    const dealId = event.inputFields['hs_object_id'];
    const dealName = event.inputFields['deal_name'];
    const dealOwnerId = event.inputFields['deal_owner_id'];

    console.log('[Input] dealId:', dealId, '| dealName:', dealName, '| dealOwnerId:', dealOwnerId);

    if (!dealId || !dealOwnerId) {
      error_message = "hs_object_id or deal_owner_id missing from workflow inputs.";
      console.error('[Error]', error_message);
      return callback({ outputFields: { success, error_message } });
    }

    // Create a new date object for current execution time - this is used for the meeting start time
    const now = new Date();
    const nowTs = now.getTime();
    console.log('[Datetime] Now:', now, '| Timestamp:', nowTs);

    // Prepare the API client
    const token = process.env.Your_Secret
    if (!token) {
      error_message = "No HubSpot token found in environment.";
      console.error('[Error]', error_message);
      return callback({ outputFields: { success, error_message } });
    }

    const api = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Retrieve all Contacts associated to the enrolled Deal
    // GET /crm/v4/objects/deal/{dealId}/associations/contact
    const assocUrl = `/crm/v4/objects/deal/${dealId}/associations/contact`;
    console.log('[API Request] GET', assocUrl);

    let contactIds = [];
    try {
      const dealAssocRes = await api.get(assocUrl);
      contactIds = (dealAssocRes.data.results || []).map(a => a.toObjectId);
      console.log('[Assoc] Contact IDs associated to Deal:', contactIds);
    } catch (err) {
      error_message = "Could not retrieve associated contacts for Deal: " + (err.response?.data ? JSON.stringify(err.response.data) : err.message);
      console.error('[Error]', error_message);
      // Don't return yet - allow meeting creation to occur without contact associations
      contactIds = [];
    }

    // Create a meeting associated to the Deal
    const meetingsUrl = `/crm/v3/objects/meetings`;
    // Compose associations: always the Deal, plus any Contacts found
    const associations = [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 212 }] // 212 is the default Meeting to Deal association type
      }
    ];

    if (contactIds && contactIds.length > 0) {
      for (const contactId of contactIds) {
        associations.push({
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 200 }] // 200 is the default Meeting to Contact association type
        });
      }
    }

    const meetingPayload = {
      properties: {
        hs_meeting_title: `Walk-in Meeting - ${dealName}`, //Replace with your desired meeting title
        hs_activity_type: "Meeting: In-Person", //Replace with your desired activity type - just copy the custom call/meeting type you want to use from your HubSpot account
        hs_meeting_outcome: "COMPLETED", //Replace with your desired meeting outcome - it needs to be capitalized as shown, even if you choose another outcome
        hs_timestamp: nowTs, //Replace with your desired timestamp - this is the time the meeting was created
        hs_meeting_start_time: nowTs, //Replace with your desired start time - this is the time the meeting was scheduled for
        hubspot_owner_id: dealOwnerId, //Replace with your desired owner ID
      },
      associations
    };
    // Log API payload for debugging
    console.log('[API Request] POST', meetingsUrl, JSON.stringify(meetingPayload));

    const createMeetingRes = await api.post(meetingsUrl, meetingPayload);

    const meetingId = createMeetingRes.data && createMeetingRes.data.id;
    console.log('[Meeting Created] ID:', meetingId);

    success = true;
    callback({ outputFields: { success, error_message, meetingId } });
  } catch (err) {
    error_message = err && err.response && err.response.data
      ? JSON.stringify(err.response.data)
      : (err.message || String(err));
    console.error('[Exception]', error_message);
    callback({ outputFields: { success: false, error_message } });
  }
};

