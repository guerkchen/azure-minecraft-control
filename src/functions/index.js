import { app } from '@azure/functions';
import { requestAccessToken, getContainerState, execContainerAction } from './azure-container-control.js'
import { getStatus } from './minecraft-status.js';
import 'dotenv/config';

async function handleServer(ctx, azureToken, minecraftUrl, minecraftPort, azureContainerGroup) {
    try {
        const minecraftStatus = await getStatus(minecraftUrl, minecraftPort) // get minecraft server status
        const minecraftStatusJson = JSON.parse(minecraftStatus)
        if (minecraftStatusJson.players && minecraftStatusJson.players.online !== 0) { // someone is on the server
            ctx.log(`${minecraftUrl}: #${minecraftStatusJson.players.online} people on the server`)
            return // no action necessary
        } else {
            ctx.log(`${minecraftUrl}: minecraft server is empty`)
        }
    } catch (error) {
        ctx.log(`${minecraftUrl}: server not respoding, proably because he is not up`)
        // we continue checking the azure container as if no one is on the server. By this we handle the edge case, that the container is running, but minecraft is not respoding
    }

    const azureStatus = await getContainerState(process.env.AZURE_SUBSCRIPTION_ID, process.env.AZURE_RESOURCE_GROUP, azureContainerGroup, azureToken)
    if (azureStatus.state == 'Running') { // container is running
        ctx.log(`${azureContainerGroup}: container is running since ${azureStatus.stateSince}`)
        try {
            // we try to check, if the server is up only for a short amount of time. If that is the case, we let it running
            const uptimeMS = new Date() - new Date(azureStatus.stateSince)
            if (uptimeMS < process.env.CONTAINER_MIN_UPTIME) {
                ctx.log(`${azureContainerGroup}: container is running for ${uptimeMS}, that is below the min uptime ${process.env.CONTAINER_MIN_UPTIME}`)
                return
            }
        } catch (error) {
            ctx.log(`${azureContainerGroup}: cannot estimate server uptime ${error}`)
        }

        ctx.log(`${azureContainerGroup}: shut down container`)
        execContainerAction(process.env.AZURE_SUBSCRIPTION_ID, process.env.AZURE_RESOURCE_GROUP, azureContainerGroup, 'stop', azureToken)
    } else {
        ctx.log(`${azureContainerGroup}: container is not running`)
    }
}

async function main(ctx) {
    var azureToken = await requestAccessToken() // get azure access token

    const azureContainerGroups = process.env.AZURE_CONTAINER_GROUPS.split(";")
    const minecraftUrls = process.env.MINECRAFT_URL.split(";")
    const minecraftPorts = process.env.MINECRAFT_PORT.split(";")
    if (azureContainerGroups.length !== minecraftUrls.length || minecraftUrls.length !== minecraftPorts.length) {
        throw new Error("are you stupid? the length of the 3 env arrays AZURE_CONTAINER_GROUPS, MINECRAFT_URL and MINECRAFT_PORT does not match.")
    }
    for (let i = 0; i < azureContainerGroups.length; i++) {
        await handleServer(ctx, azureToken, minecraftUrls[i], minecraftPorts[i], azureContainerGroups[i])
    }
}

app.timer("azure-minecraft-control", {
    schedule: process.env.AZURE_CRON_TIMER,
    handler: async (myTimer, ctx) => {
        await ctx.log("beginning azure minecraft control")
        await main(ctx)
    }
})