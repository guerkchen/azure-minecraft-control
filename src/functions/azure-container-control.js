import 'dotenv/config';
import { ClientSecretCredential } from '@azure/identity';
import fetch from 'node-fetch';

/**
 * Requests an OAuth access token for the tenant_id/client_id/client_secret from .env file
 * 
 * @returns the bearer token as a string, or throws an error if something did not work.
 */
export async function requestAccessToken() {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const scope = "https://management.azure.com/.default";
    const token = await credential.getToken(scope);

    return token.token;
}

/**
 * Starts or stops the Azure Container Instance
 */
export async function execContainerAction(subscriptionId, resourceGroup, containerGroup, action, token) {
    if (["start", "stop", "restart"].indexOf(action) < 0) {
        throw Error(`${action} is not a valid container action!`);
    }

    const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ContainerInstance/containerGroups/${containerGroup}/${action}?api-version=2023-05-01`

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        }
    });

    console.log(await resp.text());
}

/**
 * Returns the status of the Azure Container Instance running the minecraft server
 * 
 * @returns object containing state + timestamp
 */
export async function getContainerState(subscriptionId, resourceGroup, containerGroup, token) {
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ContainerInstance/containerGroups/${containerGroup}/?api-version=2023-05-01`

    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        }
    });

    var respJson = JSON.parse(await resp.text());

    const properties = respJson.properties.containers.filter(e => e.name = containerGroup)[0].properties;
    // 'properties' always exists, but instanceView and currentState might not
    const currentState = (properties && properties.instanceView)
        ? properties.instanceView.currentState
        : { state: "Terminated", stateSince: "a long time" };
    return {
        "state": currentState.state,
        "stateSince": (currentState.startTime || currentState.finishTime || "a long time"),
        "fqdn": properties?.ipAddress?.fqdn,
    }
}